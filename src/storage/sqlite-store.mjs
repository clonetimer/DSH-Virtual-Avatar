import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { applyDeepseekWhaleAffection, createDeepseekWhaleInitialState } from '../characters/deepseek-whale/relationship.mjs'

const OWNER_KINDS = new Set(['shared', 'agent-persona', 'character'])
const sha256 = value => createHash('sha256').update(value).digest('hex')

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function conflict(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS persona_definitions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('agent','companion')),
  version TEXT NOT NULL,
  source_format TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_states (
  character_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('shared','agent-persona','character')),
  owner_id TEXT NOT NULL,
  text TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'edge',
  source TEXT NOT NULL DEFAULT 'user',
  source_event_id TEXT,
  raw_text TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_owner ON memory_items(owner_kind, owner_id, pinned DESC, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS memory_events (
  event_id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  memory_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_events (
  event_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_runs (
  migration_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS migration_sources (
  source_kind TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  migration_id TEXT NOT NULL,
  source_raw TEXT,
  inspection_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY(source_kind, source_hash),
  FOREIGN KEY(migration_id) REFERENCES migration_runs(migration_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  aggregate_kind TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_event_id TEXT,
  before_hash TEXT,
  after_hash TEXT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`

export class SqliteAvatarStore {
  #db
  #closed = false

  constructor(filename = ':memory:') {
    if (filename !== ':memory:') {
      if (!isAbsolute(filename)) throw new TypeError('SQLite database path must be absolute')
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 })
    }
    this.filename = filename
    this.#db = new DatabaseSync(filename)
    this.#db.exec(SCHEMA)
    if (filename !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
  }

  #assertOpen() {
    if (this.#closed) throw new Error('SQLite avatar store is closed')
  }

  transaction(fn) {
    this.#assertOpen()
    this.#db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.#db.exec('COMMIT')
      return result
    } catch (error) {
      try { this.#db.exec('ROLLBACK') } catch { /* preserve original failure */ }
      throw error
    }
  }

  close() {
    if (this.#closed) return
    this.#db.close()
    this.#closed = true
  }

  getPersona(id) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT * FROM persona_definitions WHERE id = ?').get(String(id))
    return row ? {
      id: row.id,
      kind: row.kind,
      version: row.version,
      sourceFormat: row.source_format,
      content: row.content,
      contentHash: row.content_hash,
      enabled: row.enabled === 1,
      revision: row.revision,
      metadata: JSON.parse(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : null
  }

  upsertPersona(input, expectedRevision) {
    this.#assertOpen()
    const id = String(input?.id || '').trim()
    if (!id) throw new TypeError('persona id required')
    if (!['agent', 'companion'].includes(input.kind)) throw new TypeError('invalid persona kind')
    if (typeof input.content !== 'string' || !input.content.trim()) throw new TypeError('persona content required')
    const previous = this.getPersona(id)
    if (previous && expectedRevision !== undefined && previous.revision !== expectedRevision) {
      throw conflict('REVISION_CONFLICT', 'persona revision conflict')
    }
    if (!previous && expectedRevision !== undefined && expectedRevision !== 0) {
      throw conflict('REVISION_CONFLICT', 'persona does not exist at expected revision')
    }
    const now = new Date().toISOString()
    const row = {
      id,
      kind: input.kind,
      version: String(input.version || '1.0.0'),
      sourceFormat: String(input.sourceFormat || 'native'),
      content: input.content,
      contentHash: sha256(input.content),
      enabled: input.enabled === false ? 0 : 1,
      revision: (previous?.revision || 0) + 1,
      metadataJson: stableJson(input.metadata || {}),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    }
    this.#db.prepare(`
      INSERT INTO persona_definitions(id,kind,version,source_format,content,content_hash,enabled,revision,metadata_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind, version=excluded.version, source_format=excluded.source_format,
        content=excluded.content, content_hash=excluded.content_hash, enabled=excluded.enabled,
        revision=excluded.revision, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at
    `).run(row.id,row.kind,row.version,row.sourceFormat,row.content,row.contentHash,row.enabled,row.revision,row.metadataJson,row.createdAt,row.updatedAt)
    return this.getPersona(id)
  }

  loadCharacterState(characterId = 'deepseek') {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT state_json, revision, updated_at FROM character_states WHERE character_id = ?').get(String(characterId))
    return row ? { state: JSON.parse(row.state_json), revision: row.revision, updatedAt: row.updated_at } : null
  }

  saveCharacterState(characterId, state, expectedRevision) {
    this.#assertOpen()
    const id = String(characterId || '')
    if (!id) throw new TypeError('character id required')
    const previous = this.loadCharacterState(id)
    if (expectedRevision !== undefined && (previous?.revision || 0) !== expectedRevision) {
      throw conflict('REVISION_CONFLICT', 'character state revision conflict')
    }
    const revision = (previous?.revision || 0) + 1
    const now = new Date().toISOString()
    this.#db.prepare(`
      INSERT INTO character_states(character_id,state_json,revision,updated_at)
      VALUES(?,?,?,?)
      ON CONFLICT(character_id) DO UPDATE SET state_json=excluded.state_json, revision=excluded.revision, updated_at=excluded.updated_at
    `).run(id, stableJson(state), revision, now)
    return { state: structuredClone(state), revision, updatedAt: now }
  }

  applyAffectionEvent({ eventId, characterId = 'deepseek', delta = 0, source = 'galgame-choice', occurredAt = new Date().toISOString() }) {
    this.#assertOpen()
    const id = String(eventId || '')
    if (!id) throw new TypeError('eventId required')
    if (![ -1, 0, 1 ].includes(delta)) throw new TypeError('affection delta must be -1, 0 or 1')
    return this.transaction(() => {
      const payload = { characterId, delta, source }
      const payloadHash = sha256(stableJson(payload))
      const existingEvent = this.#db.prepare('SELECT payload_hash FROM domain_events WHERE event_id = ?').get(id)
      if (existingEvent) {
        if (existingEvent.payload_hash !== payloadHash) throw conflict('EVENT_ID_CONFLICT', 'event id was reused with a different payload')
        return { duplicate: true, state: this.loadCharacterState(characterId) }
      }
      const existingState = this.loadCharacterState(characterId)
      const current = existingState?.state || createDeepseekWhaleInitialState()
      const result = applyDeepseekWhaleAffection(current, { delta })
      const saved = this.saveCharacterState(characterId, result.state, existingState?.revision || 0)
      const now = new Date().toISOString()
      this.#db.prepare(`
        INSERT INTO domain_events(event_id,character_id,event_type,payload_hash,payload_json,occurred_at,applied_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(id, characterId, 'AFFECTION_DELTA', payloadHash, stableJson(payload), occurredAt, now)
      this.#recordAudit('character', characterId, 'AFFECTION_DELTA', id, current, saved.state, { delta, levelUps: result.levelUps })
      return { duplicate: false, ...result, state: saved.state, revision: saved.revision }
    })
  }

  listMemoryItems(ownerKind, ownerId) {
    this.#assertOpen()
    this.#validateMemoryOwner(ownerKind, ownerId)
    return this.#db.prepare(`
      SELECT * FROM memory_items
      WHERE owner_kind = ? AND owner_id = ?
      ORDER BY pinned DESC, last_seen_at DESC, created_at DESC
    `).all(ownerKind, ownerId).map(row => this.#memoryRow(row))
  }

  getMemoryItem(id) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT * FROM memory_items WHERE id = ?').get(String(id))
    return row ? this.#memoryRow(row) : null
  }

  insertMemoryItem(item) {
    this.#assertOpen()
    this.#validateMemoryOwner(item.ownerKind, item.ownerId)
    const now = item.createdAt || new Date().toISOString()
    const row = {
      id: String(item.id || randomUUID()),
      ownerKind: item.ownerKind,
      ownerId: String(item.ownerId),
      text: String(item.text || ''),
      pinned: item.pinned === true ? 1 : 0,
      hitCount: Math.max(0, Math.floor(Number(item.hitCount) || 0)),
      level: String(item.level || (item.pinned ? 'core' : 'edge')),
      source: String(item.source || 'user'),
      sourceEventId: item.sourceEventId || null,
      rawText: item.rawText || null,
      createdAt: now,
      lastSeenAt: item.lastSeenAt || now,
      updatedAt: item.updatedAt || now,
    }
    if (!row.text.trim()) throw new TypeError('memory text required')
    this.#db.prepare(`
      INSERT INTO memory_items(id,owner_kind,owner_id,text,pinned,hit_count,level,source,source_event_id,raw_text,created_at,last_seen_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(row.id,row.ownerKind,row.ownerId,row.text,row.pinned,row.hitCount,row.level,row.source,row.sourceEventId,row.rawText,row.createdAt,row.lastSeenAt,row.updatedAt)
    return this.getMemoryItem(row.id)
  }

  updateMemoryItem(id, patch) {
    this.#assertOpen()
    const previous = this.getMemoryItem(id)
    if (!previous) return null
    const next = { ...previous, ...patch, id: previous.id, ownerKind: previous.ownerKind, ownerId: previous.ownerId, updatedAt: patch.updatedAt || new Date().toISOString() }
    this.#db.prepare(`
      UPDATE memory_items SET text=?, pinned=?, hit_count=?, level=?, source=?, source_event_id=?, raw_text=?, last_seen_at=?, updated_at=?
      WHERE id=?
    `).run(next.text,next.pinned ? 1 : 0,Math.max(0,Math.floor(Number(next.hitCount)||0)),next.level,next.source,next.sourceEventId||null,next.rawText||null,next.lastSeenAt,next.updatedAt,next.id)
    return this.getMemoryItem(id)
  }

  deleteMemoryItem(id) {
    this.#assertOpen()
    return this.#db.prepare('DELETE FROM memory_items WHERE id = ?').run(String(id)).changes > 0
  }

  recordMemoryEvent({ eventId, ownerKind, ownerId, payloadHash, memoryId = null }) {
    this.#assertOpen()
    this.#validateMemoryOwner(ownerKind, ownerId)
    const id = String(eventId || '')
    if (!id) throw new TypeError('memory eventId required')
    const previous = this.#db.prepare('SELECT payload_hash, memory_id FROM memory_events WHERE event_id = ?').get(id)
    if (previous) {
      if (previous.payload_hash !== payloadHash) throw conflict('MEMORY_EVENT_CONFLICT', 'memory event id was reused with a different payload')
      return { duplicate: true, memoryId: previous.memory_id }
    }
    this.#db.prepare('INSERT INTO memory_events(event_id,owner_kind,owner_id,payload_hash,memory_id,created_at) VALUES(?,?,?,?,?,?)')
      .run(id,ownerKind,ownerId,String(payloadHash),memoryId,new Date().toISOString())
    return { duplicate: false, memoryId }
  }

  hasSource(sourceKind, sourceHash) {
    this.#assertOpen()
    return !!this.#db.prepare('SELECT 1 AS found FROM migration_sources WHERE source_kind = ? AND source_hash = ?').get(String(sourceKind), String(sourceHash))
  }

  commitMigration({ migrationId, sources }) {
    this.#assertOpen()
    return this.transaction(() => {
      const id = String(migrationId || randomUUID())
      const now = new Date().toISOString()
      const accepted = []
      const duplicate = []
      const warnings = []
      this.#db.prepare('INSERT INTO migration_runs(migration_id,status,report_json,created_at) VALUES(?,?,?,?)')
        .run(id,'committing','{}',now)
      for (const source of sources) {
        const key = String(source.sourceKind) + ':' + String(source.sourceHash)
        if (this.hasSource(source.sourceKind, source.sourceHash)) {
          duplicate.push(key)
          continue
        }
        const inspection = source.inspection || {}
        const raw = typeof inspection.raw === 'string'
          ? inspection.raw
          : (inspection.parsed ? JSON.stringify(inspection.parsed) : JSON.stringify(inspection.ir || inspection))
        this.#db.prepare(`
          INSERT INTO migration_sources(source_kind,source_hash,migration_id,source_raw,inspection_json,imported_at)
          VALUES(?,?,?,?,?,?)
        `).run(source.sourceKind,source.sourceHash,id,raw,stableJson({ ...inspection, raw: undefined }),now)
        if (source.sourceKind === 'virtual-person') {
          this.#importVirtualPerson(inspection)
        } else if (source.sourceKind === 'whale-galgame') {
          const imported = this.#importWhaleDeepseek(inspection)
          if (imported.deferredCharacters.length) warnings.push({ source: key, deferredCharacters: imported.deferredCharacters })
        } else if (source.sourceKind === 'ppl-persona-ir') {
          this.upsertPersona({
            id: inspection.personaId,
            kind: 'companion',
            version: inspection.version,
            sourceFormat: 'ppl-ir',
            content: JSON.stringify(inspection.ir),
            metadata: { sourceHash: source.sourceHash, displayName: inspection.displayName },
          })
        }
        accepted.push(key)
      }
      const report = { accepted, duplicate, warnings }
      this.#db.prepare('UPDATE migration_runs SET status=?, report_json=?, committed_at=? WHERE migration_id=?')
        .run('committed',stableJson(report),new Date().toISOString(),id)
      this.#recordAudit('migration', id, 'MIGRATION_COMMITTED', null, null, report, {})
      return report
    })
  }

  #importVirtualPerson(inspection) {
    if (inspection.personaMarkdown) {
      this.upsertPersona({
        id: 'virtual-person-global',
        kind: 'agent',
        version: 'imported-0',
        sourceFormat: 'markdown',
        content: inspection.personaMarkdown,
        metadata: { importedFrom: 'AGENT.md', sourceHash: inspection.sourceHash },
      })
    }
    for (let index = 0; index < (inspection.memories || []).length; index++) {
      const item = inspection.memories[index]
      const id = 'vp-' + sha256(inspection.sourceHash + ':' + index).slice(0, 24)
      this.#db.prepare(`
        INSERT OR IGNORE INTO memory_items(id,owner_kind,owner_id,text,pinned,hit_count,level,source,raw_text,created_at,last_seen_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(id,'agent-persona','virtual-person-global',item.body,item.pinned ? 1 : 0,item.hitCount,item.pinned ? 'core' : item.hitCount > 0 ? 'mid' : 'edge','virtual-person',item.raw,item.date + 'T' + item.time + ':00.000Z',item.date + 'T' + item.time + ':00.000Z',new Date().toISOString())
    }
  }

  #importWhaleDeepseek(inspection) {
    const parsed = inspection.parsed || {}
    const characters = parsed.characters && typeof parsed.characters === 'object' ? parsed.characters : {}
    const source = characters.deepseek
    if (!source) return { deferredCharacters: Object.keys(characters) }
    const existing = this.loadCharacterState('deepseek')
    if (existing) return { deferredCharacters: Object.keys(characters).filter(id => id !== 'deepseek'), activeCharacterConflict: true }
    const state = createDeepseekWhaleInitialState({ sessionId: 'deepseek-whale-migrated' })
    state.level = Math.max(1, Number(source.level) || 1)
    state.affection = Math.max(0, Number(source.affection) || 0)
    state.conversation = {
      log: Array.isArray(source.log) ? source.log : [],
      chatLines: Array.isArray(source.chatLines) ? source.chatLines : [],
      choices: Array.isArray(source.choices) ? source.choices : [],
    }
    state.activity = source.activity || null
    state.cgs = Array.isArray(source.cgs) ? source.cgs : []
    state.customSprite = source.customSprite || null
    state.chosenBuiltinBackground = source.chosenBuiltinBackground || null
    state.profileOverrides = source.profileOverrides || {}
    state.legacy = {
      current: parsed.current || 'deepseek',
      tokens: parsed.tokens || null,
      bg: parsed.bg || null,
      backgroundRevision: parsed.backgroundRevision || 0,
      cg: parsed.cg || null,
      preferences: parsed.preferences || {},
      characterModelLabel: parsed.characterModelLabel || '',
      chatModelLabel: parsed.chatModelLabel || '',
      fallbackUsed: parsed.fallbackUsed || false,
      fallbackReason: parsed.fallbackReason || '',
    }
    this.saveCharacterState('deepseek', state, 0)
    return { deferredCharacters: Object.keys(characters).filter(id => id !== 'deepseek') }
  }

  #memoryRow(row) {
    return {
      id: row.id,
      ownerKind: row.owner_kind,
      ownerId: row.owner_id,
      text: row.text,
      pinned: row.pinned === 1,
      hitCount: row.hit_count,
      level: row.level,
      source: row.source,
      sourceEventId: row.source_event_id,
      rawText: row.raw_text,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    }
  }

  #validateMemoryOwner(ownerKind, ownerId) {
    if (!OWNER_KINDS.has(ownerKind)) throw new TypeError('invalid memory owner kind')
    if (typeof ownerId !== 'string' || !ownerId.trim()) throw new TypeError('memory owner id required')
  }

  #recordAudit(aggregateKind, aggregateId, eventType, sourceEventId, before, after, details) {
    this.#db.prepare(`
      INSERT INTO audit_events(id,aggregate_kind,aggregate_id,event_type,source_event_id,before_hash,after_hash,details_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
      randomUUID(), aggregateKind, aggregateId, eventType, sourceEventId,
      before === null || before === undefined ? null : sha256(stableJson(before)),
      after === null || after === undefined ? null : sha256(stableJson(after)),
      stableJson(details || {}), new Date().toISOString(),
    )
  }
}

export function createAvatarStore({ dshHomePath } = {}) {
  if (typeof dshHomePath !== 'function') throw new TypeError('dshHomePath service required')
  const filename = dshHomePath('storages', 'dsh-virtual-avatar', 'avatar.sqlite')
  return new SqliteAvatarStore(filename)
}
