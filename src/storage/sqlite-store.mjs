import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { applyDeepseekWhaleAffection, createDeepseekWhaleInitialState } from '../characters/deepseek-whale/relationship.mjs'

const OWNER_KINDS = new Set(['shared', 'agent-persona', 'character'])
const sha256 = value => createHash('sha256').update(value).digest('hex')
const MAX_MEDIA_ASSET_BYTES = 12 * 1024 * 1024
const MAX_MIGRATION_MEDIA_BYTES = 64 * 1024 * 1024
const MEDIA_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
})

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

CREATE TABLE IF NOT EXISTS media_assets (
  asset_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  source_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_assets_character ON media_assets(character_id, created_at);

CREATE TABLE IF NOT EXISTS migration_rollback_snapshots (
  migration_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  before_state_json TEXT,
  before_revision INTEGER NOT NULL,
  after_revision INTEGER NOT NULL,
  created_asset_ids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL,
  rolled_back_at TEXT,
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

  constructor(filename = ':memory:', { assetDirectory = null } = {}) {
    if (filename !== ':memory:') {
      if (!isAbsolute(filename)) throw new TypeError('SQLite database path must be absolute')
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 })
    }
    if (assetDirectory !== null && !isAbsolute(assetDirectory)) throw new TypeError('media asset directory must be absolute')
    if (assetDirectory) mkdirSync(assetDirectory, { recursive: true, mode: 0o700 })
    this.filename = filename
    this.assetDirectory = assetDirectory
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

  findDomainEvent(eventId) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT event_id, character_id, event_type, payload_hash, payload_json FROM domain_events WHERE event_id = ?').get(String(eventId))
    return row ? { eventId: row.event_id, characterId: row.character_id, eventType: row.event_type, payloadHash: row.payload_hash, payload: JSON.parse(row.payload_json) } : null
  }

  commitCharacterTurn({ eventId, characterId = 'deepseek', payload, state, expectedRevision, occurredAt = new Date().toISOString() }) {
    this.#assertOpen()
    const id = String(eventId || '')
    if (!id) throw new TypeError('eventId required')
    if (!state || typeof state !== 'object') throw new TypeError('next character state required')
    return this.transaction(() => {
      const payloadHash = sha256(stableJson(payload || {}))
      const previousEvent = this.findDomainEvent(id)
      if (previousEvent) {
        if (previousEvent.payloadHash !== payloadHash) throw conflict('EVENT_ID_CONFLICT', 'turn event id was reused with a different payload')
        return { duplicate: true, state: this.loadCharacterState(characterId) }
      }
      const before = this.loadCharacterState(characterId)
      const currentRevision = before?.revision || 0
      if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
        throw conflict('REVISION_CONFLICT', 'character state changed while the turn was being generated')
      }
      const saved = this.saveCharacterState(characterId, state, currentRevision)
      const now = new Date().toISOString()
      this.#db.prepare(`
        INSERT INTO domain_events(event_id,character_id,event_type,payload_hash,payload_json,occurred_at,applied_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(id,characterId,'TURN_COMPLETED',payloadHash,stableJson(payload || {}),occurredAt,now)
      this.#recordAudit('character',characterId,'TURN_COMPLETED',id,before?.state || null,saved.state,{})
      return { duplicate: false, state: saved.state, revision: saved.revision, updatedAt: saved.updatedAt }
    })
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

  findMemoryEvent(eventId) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT event_id, owner_kind, owner_id, payload_hash, memory_id FROM memory_events WHERE event_id = ?').get(String(eventId))
    return row ? { eventId: row.event_id, ownerKind: row.owner_kind, ownerId: row.owner_id, payloadHash: row.payload_hash, memoryId: row.memory_id } : null
  }

  setMemoryEventMemoryId(eventId, memoryId) {
    this.#assertOpen()
    this.#db.prepare('UPDATE memory_events SET memory_id = ? WHERE event_id = ?').run(String(memoryId), String(eventId))
  }

  hasSource(sourceKind, sourceHash) {
    this.#assertOpen()
    return !!this.#db.prepare('SELECT 1 AS found FROM migration_sources WHERE source_kind = ? AND source_hash = ?').get(String(sourceKind), String(sourceHash))
  }

  getMigrationSource(sourceKind, sourceHash) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT source_kind, source_hash, migration_id, source_raw, inspection_json, imported_at FROM migration_sources WHERE source_kind = ? AND source_hash = ?')
      .get(String(sourceKind), String(sourceHash))
    return row ? {
      sourceKind: row.source_kind,
      sourceHash: row.source_hash,
      migrationId: row.migration_id,
      raw: row.source_raw,
      inspection: JSON.parse(row.inspection_json),
      importedAt: row.imported_at,
    } : null
  }

  previewMigrationRollback(migrationId) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT * FROM migration_rollback_snapshots WHERE migration_id = ?').get(String(migrationId))
    if (!row) return { available: false, reason: 'ROLLBACK_SNAPSHOT_NOT_FOUND' }
    if (row.status !== 'available') return { available: false, reason: 'ROLLBACK_ALREADY_USED', status: row.status }
    const current = this.loadCharacterState(row.character_id)
    if (!current || current.revision !== row.after_revision) {
      return {
        available: false,
        reason: 'POST_MIGRATION_STATE_CHANGED',
        expectedRevision: row.after_revision,
        currentRevision: current?.revision ?? null,
      }
    }
    return {
      available: true,
      migrationId: row.migration_id,
      characterId: row.character_id,
      expectedRevision: row.after_revision,
      restoreRevision: row.before_revision,
      createdAssetCount: JSON.parse(row.created_asset_ids_json).length,
    }
  }

  rollbackMigration(migrationId, { confirmed = false } = {}) {
    this.#assertOpen()
    if (confirmed !== true) throw conflict('CONFIRMATION_REQUIRED', 'explicit migration rollback confirmation is required')
    const preview = this.previewMigrationRollback(migrationId)
    if (!preview.available) throw conflict(preview.reason, 'migration rollback is blocked: ' + preview.reason)
    const filesToRemove = []
    const result = this.transaction(() => {
      const row = this.#db.prepare('SELECT * FROM migration_rollback_snapshots WHERE migration_id = ?').get(String(migrationId))
      const current = this.loadCharacterState(row.character_id)
      if (!current || current.revision !== row.after_revision) {
        throw conflict('POST_MIGRATION_STATE_CHANGED', 'character state changed after migration; rollback is blocked')
      }
      this.#db.prepare('DELETE FROM character_states WHERE character_id = ?').run(row.character_id)
      const assetIds = JSON.parse(row.created_asset_ids_json)
      for (const assetId of assetIds) {
        const asset = this.getMediaAsset(assetId)
        if (asset) {
          if (!this.assetDirectory || !asset.relativePath.startsWith('deepseek/')) {
            throw conflict('MEDIA_ASSET_PATH_INVALID', 'rollback encountered an invalid media asset path')
          }
          filesToRemove.push(join(this.assetDirectory, asset.relativePath))
          this.#db.prepare('DELETE FROM media_assets WHERE asset_id = ?').run(assetId)
        }
      }
      this.#db.prepare("UPDATE migration_rollback_snapshots SET status='rolled_back', rolled_back_at=? WHERE migration_id=?")
        .run(new Date().toISOString(), String(migrationId))
      this.#db.prepare("UPDATE migration_runs SET status='rolled_back' WHERE migration_id=?")
        .run(String(migrationId))
      this.#recordAudit('migration', String(migrationId), 'MIGRATION_ROLLED_BACK', null, current.state, null, {
        characterId: row.character_id,
        removedAssetCount: filesToRemove.length,
      })
      return { migrationId: String(migrationId), status: 'rolled_back', removedAssetCount: filesToRemove.length }
    })
    const cleanupErrors = []
    for (const filename of filesToRemove) {
      try { rmSync(filename, { force: true }) } catch (error) { cleanupErrors.push({ filename, message: error.message }) }
    }
    return { ...result, cleanupErrors }
  }

  getMediaAsset(assetId) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT * FROM media_assets WHERE asset_id = ?').get(String(assetId))
    return row ? {
      id: row.asset_id,
      characterId: row.character_id,
      mimeType: row.mime_type,
      relativePath: row.relative_path,
      sha256: row.sha256,
      byteLength: row.byte_length,
      sourceHash: row.source_hash,
      sourcePath: row.source_path,
      createdAt: row.created_at,
    } : null
  }

  listMediaAssets(characterId = 'deepseek') {
    this.#assertOpen()
    return this.#db.prepare('SELECT * FROM media_assets WHERE character_id = ? ORDER BY created_at, asset_id')
      .all(String(characterId)).map(row => ({
        id: row.asset_id,
        characterId: row.character_id,
        mimeType: row.mime_type,
        relativePath: row.relative_path,
        sha256: row.sha256,
        byteLength: row.byte_length,
        sourceHash: row.source_hash,
        sourcePath: row.source_path,
        createdAt: row.created_at,
      }))
  }

  readMediaAsset(assetId) {
    this.#assertOpen()
    const asset = this.getMediaAsset(assetId)
    if (!asset) return null
    if (!this.assetDirectory) throw conflict('MEDIA_STORAGE_UNAVAILABLE', 'media asset directory is not configured')
    if (!asset.relativePath.startsWith('deepseek/') || asset.relativePath.includes('..')) {
      throw conflict('MEDIA_ASSET_PATH_INVALID', 'stored media asset path is invalid')
    }
    const absolutePath = join(this.assetDirectory, asset.relativePath)
    let bytes
    try { bytes = readFileSync(absolutePath) } catch (cause) {
      const error = conflict('MEDIA_ASSET_MISSING', 'stored media asset file is missing')
      error.cause = cause
      throw error
    }
    if (sha256(bytes) !== asset.sha256 || bytes.length !== asset.byteLength) {
      throw conflict('MEDIA_ASSET_HASH_MISMATCH', 'stored media asset failed hash verification')
    }
    return { asset, bytes }
  }

  commitMigration({ migrationId, sources }) {
    this.#assertOpen()
    const createdFiles = []
    const createdAssetIds = []
    try {
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
            : JSON.stringify(inspection.ir || inspection.parsed || inspection)
          const { raw: _raw, parsed: _parsed, ir: _ir, ...inspectionSummary } = inspection
          this.#db.prepare('INSERT INTO migration_sources(source_kind,source_hash,migration_id,source_raw,inspection_json,imported_at) VALUES(?,?,?,?,?,?)')
            .run(source.sourceKind,source.sourceHash,id,raw,stableJson(inspectionSummary),now)
          if (source.sourceKind === 'virtual-person') {
            this.#importVirtualPerson(inspection)
          } else if (source.sourceKind === 'whale-galgame') {
            const imported = this.#importWhaleDeepseek(inspection, source.sourceHash, createdFiles, createdAssetIds, id)
            if (imported.deferredCharacters.length || imported.mediaAssetsImported || imported.activeCharacterConflict) {
              warnings.push({
                source: key,
                deferredCharacters: imported.deferredCharacters,
                mediaAssetsImported: imported.mediaAssetsImported,
                activeCharacterConflict: imported.activeCharacterConflict === true,
              })
            }
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
    } catch (error) {
      for (const filename of createdFiles) {
        try { rmSync(filename, { force: true }) } catch { /* preserve the original migration error */ }
      }
      throw error
    }
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
      `).run(id,'agent-persona','virtual-person-global',item.body,item.pinned ? 1 : 0,item.hitCount,item.pinned ? 'core' : item.hitCount > 0 ? 'mid' : 'edge','virtual-person',item.raw,item.date + ' ' + item.time,item.date + ' ' + item.time,new Date().toISOString())
    }
  }

  #extractMediaReferences(value, { sourceHash, sourcePath, createdFiles, createdAssetIds, assets }) {
    if (typeof value === 'string') {
      if (!/^data:image\//i.test(value)) return value
      const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
      if (!match) throw conflict('INVALID_MEDIA_DATA_URL', 'legacy image data URL is malformed at ' + sourcePath)
      const mimeType = match[1].toLowerCase()
      const extension = MEDIA_EXTENSIONS[mimeType]
      if (!extension) throw conflict('UNSUPPORTED_MEDIA_TYPE', 'legacy media type is not supported: ' + mimeType)
      const encoded = match[2].replace(/\s/g, '')
      if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
        throw conflict('INVALID_MEDIA_DATA_URL', 'legacy image base64 payload is malformed at ' + sourcePath)
      }
      const bytes = Buffer.from(encoded, 'base64')
      const canonicalBase64 = bytes.toString('base64')
      if (!bytes.length || (encoded !== canonicalBase64 && encoded !== canonicalBase64.replace(/=+$/,''))) {
        throw conflict('INVALID_MEDIA_DATA_URL', 'legacy image base64 payload failed canonical validation at ' + sourcePath)
      }
      if (bytes.length > MAX_MEDIA_ASSET_BYTES) {
        throw conflict('MEDIA_ASSET_TOO_LARGE', 'legacy image exceeds the 12 MiB per-asset limit at ' + sourcePath)
      }
      if (!this.assetDirectory) throw conflict('MEDIA_STORAGE_UNAVAILABLE', 'configure a persistent media asset directory before importing legacy images')

      const contentHash = sha256(bytes)
      const assetId = createHash('sha256').update(mimeType).update(String.fromCharCode(0)).update(bytes).digest('hex')
      const existing = this.getMediaAsset(assetId)
      if (existing) {
        const verified = this.readMediaAsset(assetId)
        if (existing.mimeType !== mimeType || existing.sha256 !== contentHash || !verified) {
          throw conflict('MEDIA_ASSET_HASH_MISMATCH', 'existing media asset metadata does not match imported bytes')
        }
        assets.set(assetId, existing)
        return 'asset://dsh-virtual-avatar/' + assetId
      }
      const alreadyStaged = assets.get(assetId)
      if (alreadyStaged) return 'asset://dsh-virtual-avatar/' + assetId
      const stagedBytes = Array.from(assets.values()).reduce((sum, item) => sum + item.byteLength, 0)
      if (stagedBytes + bytes.length > MAX_MIGRATION_MEDIA_BYTES) {
        throw conflict('MEDIA_MIGRATION_TOO_LARGE', 'DeepSeek migration exceeds the 64 MiB total media limit')
      }

      const relativePath = 'deepseek/' + contentHash + '.' + extension
      const absolutePath = join(this.assetDirectory, relativePath)
      mkdirSync(dirname(absolutePath), { recursive: true, mode: 0o700 })
      if (existsSync(absolutePath)) {
        const existingBytes = readFileSync(absolutePath)
        if (sha256(existingBytes) !== contentHash) {
          throw conflict('MEDIA_ASSET_HASH_MISMATCH', 'an existing file at the content-addressed media path failed verification')
        }
      } else {
        const temporaryPath = absolutePath + '.' + randomUUID() + '.tmp'
        writeFileSync(temporaryPath, bytes, { flag: 'wx', mode: 0o600 })
        try { renameSync(temporaryPath, absolutePath) } catch (error) {
          try { rmSync(temporaryPath, { force: true }) } catch { /* preserve rename failure */ }
          throw error
        }
        createdFiles.push(absolutePath)
      }
      const createdAt = new Date().toISOString()
      const asset = {
        id: assetId,
        characterId: 'deepseek',
        mimeType,
        relativePath,
        sha256: contentHash,
        byteLength: bytes.length,
        sourceHash,
        sourcePath,
        createdAt,
      }
      this.#db.prepare('INSERT INTO media_assets(asset_id,character_id,mime_type,relative_path,sha256,byte_length,source_hash,source_path,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(asset.id,asset.characterId,asset.mimeType,asset.relativePath,asset.sha256,asset.byteLength,asset.sourceHash,asset.sourcePath,asset.createdAt)
      assets.set(assetId, asset)
      createdAssetIds.push(assetId)
      return 'asset://dsh-virtual-avatar/' + assetId
    }
    if (Array.isArray(value)) {
      return value.map((entry, index) => this.#extractMediaReferences(entry, {
        sourceHash, sourcePath: sourcePath + '[' + index + ']', createdFiles, createdAssetIds, assets,
      }))
    }
    if (value && typeof value === 'object') {
      const output = {}
      for (const [key, entry] of Object.entries(value)) {
        output[key] = this.#extractMediaReferences(entry, {
          sourceHash, sourcePath: sourcePath + '.' + key, createdFiles, createdAssetIds, assets,
        })
      }
      return output
    }
    return value
  }

  #importWhaleDeepseek(inspection, sourceHash, createdFiles, createdAssetIds, migrationId) {
    const parsed = inspection.parsed || {}
    const characters = parsed.characters && typeof parsed.characters === 'object' ? parsed.characters : {}
    const source = characters.deepseek
    if (!source) return { deferredCharacters: Object.keys(characters), mediaAssetsImported: 0, activeCharacterConflict: false }
    const existing = this.loadCharacterState('deepseek')
    if (existing) return { deferredCharacters: Object.keys(characters).filter(id => id !== 'deepseek'), mediaAssetsImported: 0, activeCharacterConflict: true }

    const assets = new Map()
    const importedSource = this.#extractMediaReferences(source, {
      sourceHash, sourcePath: '$.characters.deepseek', createdFiles, createdAssetIds, assets,
    })
    const importedSharedMedia = this.#extractMediaReferences({ bg: parsed.bg, cg: parsed.cg }, {
      sourceHash, sourcePath: '
    })
    const state = createDeepseekWhaleInitialState({ sessionId: 'deepseek-whale-migrated' })
    state.level = Math.max(1, Number(importedSource.level) || 1)
    state.affection = Math.max(0, Number(importedSource.affection) || 0)
    state.conversation = {
      log: Array.isArray(importedSource.log) ? importedSource.log : [],
      chatLines: Array.isArray(importedSource.chatLines) ? importedSource.chatLines : [],
      choices: Array.isArray(importedSource.choices) ? importedSource.choices : [],
    }
    state.activity = importedSource.activity || null
    state.cgs = Array.isArray(importedSource.cgs) ? importedSource.cgs : []
    state.customSprite = importedSource.customSprite || null
    state.chosenBuiltinBackground = importedSource.chosenBuiltinBackground || null
    state.profileOverrides = importedSource.profileOverrides || {}
    state.legacy = {
      current: parsed.current || 'deepseek',
      tokens: parsed.tokens || null,
      bg: importedSharedMedia.bg ?? parsed.bg ?? null,
      backgroundRevision: parsed.backgroundRevision || 0,
      cg: importedSharedMedia.cg ?? parsed.cg ?? null,
      preferences: parsed.preferences || {},
      characterModelLabel: parsed.characterModelLabel || '',
      chatModelLabel: parsed.chatModelLabel || '',
      fallbackUsed: parsed.fallbackUsed || false,
      fallbackReason: parsed.fallbackReason || '',
    }
    const saved = this.saveCharacterState('deepseek', state, 0)
    this.#db.prepare(`
      INSERT INTO migration_rollback_snapshots(
        migration_id,character_id,before_state_json,before_revision,after_revision,created_asset_ids_json,status,created_at
      ) VALUES(?,?,?,?,?,?,?,?)
    `).run(
      migrationId,
      'deepseek',
      null,
      0,
      saved.revision,
      stableJson(createdAssetIds),
      'available',
      new Date().toISOString(),
    )
    return {
      deferredCharacters: Object.keys(characters).filter(id => id !== 'deepseek'),
      mediaAssetsImported: assets.size,
      activeCharacterConflict: false,
    }
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
  const storageRoot = dshHomePath('storages', 'dsh-virtual-avatar')
  const filename = join(storageRoot, 'avatar.sqlite')
  const assetDirectory = join(storageRoot, 'assets')
  return new SqliteAvatarStore(filename, { assetDirectory })
}
, createdFiles, createdAssetIds, assets,
    })
    const state = createDeepseekWhaleInitialState({ sessionId: 'deepseek-whale-migrated' })
    state.level = Math.max(1, Number(importedSource.level) || 1)
    state.affection = Math.max(0, Number(importedSource.affection) || 0)
    state.conversation = {
      log: Array.isArray(importedSource.log) ? importedSource.log : [],
      chatLines: Array.isArray(importedSource.chatLines) ? importedSource.chatLines : [],
      choices: Array.isArray(importedSource.choices) ? importedSource.choices : [],
    }
    state.activity = importedSource.activity || null
    state.cgs = Array.isArray(importedSource.cgs) ? importedSource.cgs : []
    state.customSprite = importedSource.customSprite || null
    state.chosenBuiltinBackground = importedSource.chosenBuiltinBackground || null
    state.profileOverrides = importedSource.profileOverrides || {}
    state.legacy = {
      current: parsed.current || 'deepseek',
      tokens: parsed.tokens || null,
      bg: importedSharedMedia.bg ?? parsed.bg ?? null,
      backgroundRevision: parsed.backgroundRevision || 0,
      cg: importedSharedMedia.cg ?? parsed.cg ?? null,
      preferences: parsed.preferences || {},
      characterModelLabel: parsed.characterModelLabel || '',
      chatModelLabel: parsed.chatModelLabel || '',
      fallbackUsed: parsed.fallbackUsed || false,
      fallbackReason: parsed.fallbackReason || '',
    }
    this.saveCharacterState('deepseek', state, 0)
    return {
      deferredCharacters: Object.keys(characters).filter(id => id !== 'deepseek'),
      mediaAssetsImported: assets.size,
      activeCharacterConflict: false,
    }
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
  const storageRoot = dshHomePath('storages', 'dsh-virtual-avatar')
  const filename = join(storageRoot, 'avatar.sqlite')
  const assetDirectory = join(storageRoot, 'assets')
  return new SqliteAvatarStore(filename, { assetDirectory })
}
