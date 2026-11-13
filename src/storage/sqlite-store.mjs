import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { applyDeepseekWhaleAffection, createDeepseekWhaleInitialState } from '../characters/deepseek-whale/relationship.mjs'

const OWNER_KINDS = new Set(['shared', 'agent-persona', 'character'])
const sha256 = value => createHash('sha256').update(value).digest('hex')
const BACKUP_SCHEMA = 'dsh-virtual-avatar.backup/1'
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

CREATE TABLE IF NOT EXISTS motion_packs (
  pack_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  pet_config_json TEXT NOT NULL,
  act_config_json TEXT NOT NULL,
  catalog_json TEXT NOT NULL,
  frame_count INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_motion_packs_character ON motion_packs(character_id, created_at DESC);

CREATE TABLE IF NOT EXISTS motion_pack_assets (
  pack_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  PRIMARY KEY(pack_id, relative_path),
  FOREIGN KEY(pack_id) REFERENCES motion_packs(pack_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_motion_pack_assets_pack ON motion_pack_assets(pack_id, relative_path);

CREATE TABLE IF NOT EXISTS motion_pack_bindings (
  character_id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  identity_confirmed INTEGER NOT NULL CHECK(identity_confirmed = 1),
  mapping_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(pack_id) REFERENCES motion_packs(pack_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_motion_pack_bindings_pack ON motion_pack_bindings(pack_id);

CREATE TABLE IF NOT EXISTS migration_rollback_snapshots (migration_id TEXT PRIMARY KEY, character_id TEXT NOT NULL, after_revision INTEGER NOT NULL, created_asset_ids_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available', created_at TEXT NOT NULL, rolled_back_at TEXT, FOREIGN KEY(migration_id) REFERENCES migration_runs(migration_id));

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
    this.#reconcileMotionPackDirectories()
    if (filename !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
  }

  #reconcileMotionPackDirectories() {
    if (!this.assetDirectory) return
    const root = join(this.assetDirectory, 'motion-packs')
    if (!existsSync(root)) return
    const known = new Set(this.#db.prepare('SELECT pack_id FROM motion_packs').all().map(row => row.pack_id))
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const absolute = join(root, entry.name)
      const deleting = /^\.([0-9a-f-]{36})\.deleting$/i.exec(entry.name)
      if (deleting) {
        const packId = deleting[1]
        const finalDirectory = join(root, packId)
        if (known.has(packId) && !existsSync(finalDirectory)) {
          try { renameSync(absolute, finalDirectory) } catch { /* keep tombstone for the next startup */ }
        } else {
          try { rmSync(absolute, { recursive: true, force: true }) } catch { /* retry on next startup */ }
        }
        continue
      }
      if (/^\.[0-9a-f-]{36}\.tmp$/i.test(entry.name) || !known.has(entry.name)) {
        try { rmSync(absolute, { recursive: true, force: true }) } catch { /* retry on next startup */ }
      }
    }
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

  createBackup(backupDirectory) {
    this.#assertOpen()
    if (!isAbsolute(backupDirectory)) throw new TypeError('backup directory must be absolute')
    if (this.filename === ':memory:') throw conflict('BACKUP_REQUIRES_FILE_DATABASE', 'persistent SQLite database is required for backup')
    if (existsSync(backupDirectory)) throw conflict('BACKUP_DESTINATION_EXISTS', 'backup destination already exists')
    const parent = dirname(backupDirectory)
    mkdirSync(parent, { recursive: true, mode: 0o700 })
    const temporary = backupDirectory + '.' + randomUUID() + '.tmp'
    mkdirSync(temporary, { recursive: true, mode: 0o700 })
    try {
      const databasePath = join(temporary, 'avatar.sqlite')
      const escaped = databasePath.replace(/'/g, "''")
      this.#db.exec("PRAGMA wal_checkpoint(FULL)")
      this.#db.exec("VACUUM INTO '" + escaped + "'")
      const assetsPath = join(temporary, 'assets')
      if (this.assetDirectory && existsSync(this.assetDirectory)) cpSync(this.assetDirectory, assetsPath, { recursive: true, errorOnExist: true, force: false })
      const entries = []
      const walk = (directory, prefix = '') => {
        if (!existsSync(directory)) return
        for (const name of readdirSync(directory).sort()) {
          const absolute = join(directory, name)
          const relative = prefix ? prefix + '/' + name : name
          const stat = statSync(absolute)
          if (stat.isDirectory()) walk(absolute, relative)
          else if (stat.isFile()) {
            const bytes = readFileSync(absolute)
            entries.push({ path: relative, byteLength: bytes.length, sha256: sha256(bytes) })
          } else throw conflict('BACKUP_UNSUPPORTED_FILE', 'backup contains a non-regular file')
        }
      }
      walk(temporary)
      const manifest = {
        schema: BACKUP_SCHEMA,
        createdAt: new Date().toISOString(),
        pluginVersion: '0.1.0-dev.12',
        database: { path: 'avatar.sqlite', byteLength: statSync(databasePath).size, sha256: sha256(readFileSync(databasePath)) },
        assets: entries.filter(item => item.path.startsWith('assets/')),
        files: entries,
      }
      writeFileSync(join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
      renameSync(temporary, backupDirectory)
      return { schema: BACKUP_SCHEMA, createdAt: manifest.createdAt, fileCount: entries.length + 1, byteLength: entries.reduce((sum, item) => sum + item.byteLength, manifest.database.byteLength), manifest }
    } catch (error) {
      try { rmSync(temporary, { recursive: true, force: true }) } catch { /* preserve original error */ }
      throw error
    }
  }

  verifyBackup(backupDirectory) {
    this.#assertOpen()
    if (!isAbsolute(backupDirectory)) throw new TypeError('backup directory must be absolute')
    const manifestPath = join(backupDirectory, 'manifest.json')
    let manifest
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch (cause) {
      const error = conflict('BACKUP_MANIFEST_INVALID', 'backup manifest is missing or invalid')
      error.cause = cause
      throw error
    }
    if (manifest.schema !== BACKUP_SCHEMA || manifest.database?.path !== 'avatar.sqlite' || !Array.isArray(manifest.files)) {
      throw conflict('BACKUP_SCHEMA_UNSUPPORTED', 'backup schema is unsupported')
    }
    const checked = []
    for (const entry of manifest.files) {
      if (typeof entry.path !== 'string' || entry.path.startsWith('/') || entry.path.includes('..') || entry.path.includes('\\')) {
        throw conflict('BACKUP_PATH_INVALID', 'backup contains an unsafe path')
      }
      const absolute = join(backupDirectory, entry.path)
      let bytes
      try { bytes = readFileSync(absolute) } catch (cause) {
        const error = conflict('BACKUP_FILE_MISSING', 'backup file is missing: ' + entry.path)
        error.cause = cause
        throw error
      }
      if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
        throw conflict('BACKUP_HASH_MISMATCH', 'backup file failed integrity verification: ' + entry.path)
      }
      checked.push(entry.path)
    }
    const databaseBytes = readFileSync(join(backupDirectory, 'avatar.sqlite'))
    if (databaseBytes.length !== manifest.database.byteLength || sha256(databaseBytes) !== manifest.database.sha256) {
      throw conflict('BACKUP_HASH_MISMATCH', 'backup database failed integrity verification')
    }
    return { valid: true, schema: manifest.schema, createdAt: manifest.createdAt, fileCount: checked.length, byteLength: checked.reduce((sum, path) => sum + statSync(join(backupDirectory, path)).size, 0) }
  }

  restoreBackup(backupDirectory) {
    this.#assertOpen()
    const verified = this.verifyBackup(backupDirectory)
    if (!verified.valid) throw conflict('BACKUP_VERIFICATION_FAILED', 'backup did not pass verification')
    if (this.filename === ':memory:' || !this.assetDirectory) throw conflict('RESTORE_REQUIRES_PERSISTENT_STORAGE', 'persistent database and asset directory are required')
    const databaseDirectory = dirname(this.filename)
    const restoreRoot = join(databaseDirectory, '.restore-' + randomUUID())
    const oldDatabase = this.filename + '.pre-restore-' + randomUUID()
    const oldAssets = this.assetDirectory + '.pre-restore-' + randomUUID()
    mkdirSync(restoreRoot, { recursive: true, mode: 0o700 })
    const newDatabase = join(restoreRoot, 'avatar.sqlite')
    const newAssets = join(restoreRoot, 'assets')
    cpSync(join(backupDirectory, 'avatar.sqlite'), newDatabase)
    if (existsSync(join(backupDirectory, 'assets'))) cpSync(join(backupDirectory, 'assets'), newAssets, { recursive: true })
    const oldDbExisted = existsSync(this.filename)
    const oldAssetsExisted = existsSync(this.assetDirectory)
    this.#db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    this.#db.close()
    this.#closed = true
    let dbMoved = false
    let assetsMoved = false
    try {
      if (oldDbExisted) { renameSync(this.filename, oldDatabase); dbMoved = true }
      if (oldAssetsExisted) { renameSync(this.assetDirectory, oldAssets); assetsMoved = true }
      renameSync(newDatabase, this.filename)
      if (existsSync(newAssets)) renameSync(newAssets, this.assetDirectory)
      this.#db = new DatabaseSync(this.filename)
      this.#db.exec(SCHEMA)
      this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
      this.#closed = false
      rmSync(restoreRoot, { recursive: true, force: true })
      rmSync(oldDatabase, { force: true })
      rmSync(oldAssets, { recursive: true, force: true })
      return { restored: true, backupCreatedAt: verified.createdAt, verifiedFiles: verified.fileCount }
    } catch (error) {
      try { this.#db.close() } catch { /* closed handle */ }
      try { rmSync(this.filename, { force: true }) } catch { /* restore below */ }
      try { rmSync(this.assetDirectory, { recursive: true, force: true }) } catch { /* restore below */ }
      if (dbMoved && existsSync(oldDatabase)) renameSync(oldDatabase, this.filename)
      if (assetsMoved && existsSync(oldAssets)) renameSync(oldAssets, this.assetDirectory)
      this.#db = new DatabaseSync(this.filename)
      this.#db.exec(SCHEMA)
      this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
      this.#closed = false
      try { rmSync(restoreRoot, { recursive: true, force: true }) } catch { /* preserve restore failure */ }
      throw error
    }
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
      const beforeState = before?.state || {}
      const beforeRelationship = beforeState.relationship || {}
      const afterRelationship = saved.state.relationship || {}
      const requestedDelta = Number(payload?.requestedAffectionDelta || 0)
      const appliedDelta = Number(payload?.affectionDelta || 0)
      const relationshipDetails = {
        source: 'companion-chat',
        requestedAffectionDelta: requestedDelta,
        appliedAffectionDelta: appliedDelta,
        affectionBefore: Number(beforeState.affection || 0),
        affectionAfter: Number(saved.state.affection || 0),
        levelBefore: Number(beforeState.level || 1),
        levelAfter: Number(saved.state.level || 1),
        trustBefore: Number(beforeRelationship.trust || 0),
        trustAfter: Number(afterRelationship.trust || 0),
        attachmentBefore: Number(beforeRelationship.attachment || 0),
        attachmentAfter: Number(afterRelationship.attachment || 0),
        stageBefore: String(beforeRelationship.stage || 'acquaintance'),
        stageAfter: String(afterRelationship.stage || 'acquaintance'),
        stageChanged: String(beforeRelationship.stage || 'acquaintance') !== String(afterRelationship.stage || 'acquaintance'),
        levelChanged: Number(beforeState.level || 1) !== Number(saved.state.level || 1),
      }
      this.#recordAudit('character',characterId,'TURN_COMPLETED',id,beforeState,saved.state,relationshipDetails)
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
    const row = this.#db.prepare('SELECT * FROM migration_rollback_snapshots WHERE migration_id=?').get(String(migrationId))
    if (!row) return { available: false, reason: 'ROLLBACK_SNAPSHOT_NOT_FOUND' }
    if (row.status !== 'available') return { available: false, reason: 'ROLLBACK_ALREADY_USED' }
    const current = this.loadCharacterState(row.character_id)
    if (!current || current.revision !== row.after_revision) return { available: false, reason: 'POST_MIGRATION_STATE_CHANGED' }
    return { available: true, migrationId: row.migration_id, expectedRevision: row.after_revision, createdAssetCount: JSON.parse(row.created_asset_ids_json).length }
  }

  rollbackMigration(migrationId, { confirmed = false } = {}) {
    this.#assertOpen()
    if (confirmed !== true) throw conflict('CONFIRMATION_REQUIRED', 'explicit migration rollback confirmation is required')
    const preview = this.previewMigrationRollback(migrationId)
    if (!preview.available) throw conflict(preview.reason, 'migration rollback is blocked')
    const files = []
    const result = this.transaction(() => {
      const row = this.#db.prepare('SELECT * FROM migration_rollback_snapshots WHERE migration_id=?').get(String(migrationId))
      const current = this.loadCharacterState(row.character_id)
      if (!current || current.revision !== row.after_revision) throw conflict('POST_MIGRATION_STATE_CHANGED', 'character changed after migration')
      this.#db.prepare('DELETE FROM character_states WHERE character_id=?').run(row.character_id)
      for (const assetId of JSON.parse(row.created_asset_ids_json)) {
        const asset = this.getMediaAsset(assetId)
        if (!asset) continue
        if (!asset.relativePath.startsWith('deepseek/') || asset.relativePath.includes('..')) throw conflict('MEDIA_ASSET_PATH_INVALID', 'invalid media path')
        files.push(join(this.assetDirectory, asset.relativePath))
        this.#db.prepare('DELETE FROM media_assets WHERE asset_id=?').run(assetId)
      }
      this.#db.prepare("UPDATE migration_rollback_snapshots SET status='rolled_back',rolled_back_at=? WHERE migration_id=?").run(new Date().toISOString(),String(migrationId))
      this.#db.prepare("UPDATE migration_runs SET status='rolled_back' WHERE migration_id=?").run(String(migrationId))
      this.#recordAudit('migration',String(migrationId),'MIGRATION_ROLLED_BACK',null,current.state,null,{removedAssetCount:files.length})
      return { migrationId:String(migrationId),status:'rolled_back',removedAssetCount:files.length }
    })
    const cleanupErrors = []
    for (const file of files) { try { rmSync(file,{force:true}) } catch (error) { cleanupErrors.push(error.message) } }
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


  getMotionPack(packId) {
    this.#assertOpen()
    const row = this.#db.prepare('SELECT * FROM motion_packs WHERE pack_id=?').get(String(packId))
    if (!row) return null
    return {
      id: row.pack_id,
      characterId: row.character_id,
      displayName: row.display_name,
      sourceHash: row.source_hash,
      petConfig: JSON.parse(row.pet_config_json),
      actConfig: JSON.parse(row.act_config_json),
      catalog: JSON.parse(row.catalog_json),
      frameCount: row.frame_count,
      byteLength: row.byte_length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  listMotionPacks(characterId = 'deepseek') {
    this.#assertOpen()
    return this.#db.prepare('SELECT pack_id FROM motion_packs WHERE character_id=? ORDER BY created_at DESC,pack_id')
      .all(String(characterId)).map(row => this.getMotionPack(row.pack_id))
  }

  importMotionPack({ characterId = 'deepseek', displayName, petConfig, actConfig, catalog, frames } = {}) {
    this.#assertOpen()
    if (!this.assetDirectory) throw conflict('MOTION_STORAGE_UNAVAILABLE', 'persistent motion asset storage is not configured')
    if (characterId !== 'deepseek') throw conflict('MOTION_CHARACTER_UNSUPPORTED', 'this plugin only accepts motion packs for the DeepSeek Whale character')
    const name = String(displayName || '').trim().slice(0, 64)
    if (!name) throw conflict('MOTION_PACK_NAME_REQUIRED', 'motion pack display name is required')
    if (!petConfig || typeof petConfig !== 'object' || Array.isArray(petConfig)
        || !actConfig || typeof actConfig !== 'object' || Array.isArray(actConfig)
        || !catalog || catalog.schema !== 'dsh.dyberpet-motion/1') {
      throw conflict('MOTION_PACK_CONFIG_INVALID', 'validated DyberPet configuration and catalog are required')
    }
    if (!Array.isArray(frames) || !frames.length || frames.length > 1200) {
      throw conflict('MOTION_PACK_FRAME_COUNT_INVALID', 'motion pack must contain 1 to 1200 PNG frames')
    }

    const normalized = []
    const seen = new Set()
    let totalBytes = 0
    for (const item of frames) {
      const relativePath = String(item?.path || '')
      if (!/^action\/[A-Za-z0-9_-]+_[0-9]+\.png$/i.test(relativePath) || relativePath.includes('..')) {
        throw conflict('MOTION_PACK_PATH_INVALID', 'motion frame path is invalid')
      }
      const key = relativePath.toLowerCase()
      if (seen.has(key)) throw conflict('MOTION_PACK_FRAME_DUPLICATE', 'motion pack contains duplicate frame paths')
      seen.add(key)
      const bytes = Buffer.isBuffer(item.bytes) ? item.bytes : Buffer.from(item.bytes || [])
      if (!bytes.length || bytes.length > 6 * 1024 * 1024) throw conflict('MOTION_PACK_FRAME_SIZE_INVALID', 'each motion PNG must be between 1 byte and 6 MiB')
      if (bytes.length < 8 || !Buffer.from([137,80,78,71,13,10,26,10]).equals(bytes.subarray(0,8))) {
        throw conflict('MOTION_PACK_PNG_INVALID', 'motion frame is not a PNG file')
      }
      totalBytes += bytes.length
      if (totalBytes > 64 * 1024 * 1024) throw conflict('MOTION_PACK_TOO_LARGE', 'motion pack exceeds the 64 MiB total limit')
      normalized.push({ path: relativePath, bytes, sha256: sha256(bytes) })
    }

    const sourceDigest = createHash('sha256')
    sourceDigest.update(stableJson({ characterId, displayName: name, petConfig, actConfig, catalog }))
    for (const item of normalized.sort((a,b) => a.path.localeCompare(b.path))) {
      sourceDigest.update(item.path).update('\0').update(item.sha256)
    }
    const sourceHash = sourceDigest.digest('hex')
    const existing = this.#db.prepare('SELECT pack_id FROM motion_packs WHERE source_hash=?').get(sourceHash)
    if (existing) return { duplicate: true, pack: this.getMotionPack(existing.pack_id) }

    const packId = randomUUID()
    const createdAt = new Date().toISOString()
    const parent = join(this.assetDirectory, 'motion-packs')
    const temporary = join(parent, '.' + packId + '.tmp')
    const finalDirectory = join(parent, packId)
    mkdirSync(temporary, { recursive: true, mode: 0o700 })
    let moved = false
    try {
      for (const item of normalized) {
        const absolute = join(temporary, item.path)
        mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 })
        writeFileSync(absolute, item.bytes, { flag: 'wx', mode: 0o600 })
      }
      renameSync(temporary, finalDirectory)
      moved = true
      this.transaction(() => {
        this.#db.prepare(`
          INSERT INTO motion_packs(pack_id,character_id,display_name,source_hash,pet_config_json,act_config_json,catalog_json,frame_count,byte_length,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)
        `).run(packId, characterId, name, sourceHash, stableJson(petConfig), stableJson(actConfig), stableJson(catalog), normalized.length, totalBytes, createdAt, createdAt)
        const insert = this.#db.prepare('INSERT INTO motion_pack_assets(pack_id,relative_path,sha256,byte_length,mime_type) VALUES(?,?,?,?,?)')
        for (const item of normalized) {
          insert.run(packId, item.path, item.sha256, item.bytes.length, 'image/png')
        }
        this.#recordAudit('motion-pack', packId, 'MOTION_PACK_IMPORTED', null, null, { sourceHash }, {
          characterId, displayName: name, frameCount: normalized.length, byteLength: totalBytes,
        })
      })
      return { duplicate: false, pack: this.getMotionPack(packId) }
    } catch (error) {
      try { rmSync(temporary, { recursive: true, force: true }) } catch { /* preserve original error */ }
      if (moved) { try { rmSync(finalDirectory, { recursive: true, force: true }) } catch { /* preserve original error */ } }
      throw error
    }
  }


  getMotionPackBinding(characterId = 'deepseek') {
    this.#assertOpen()
    const row = this.#db.prepare(`
      SELECT b.character_id,b.pack_id,b.identity_confirmed,b.mapping_json,b.created_at,b.updated_at,
             p.display_name,p.source_hash,p.catalog_json,p.frame_count,p.byte_length
      FROM motion_pack_bindings b
      JOIN motion_packs p ON p.pack_id=b.pack_id
      WHERE b.character_id=?
    `).get(String(characterId))
    return row ? {
      characterId: row.character_id,
      packId: row.pack_id,
      displayName: row.display_name,
      sourceHash: row.source_hash,
      identityConfirmed: row.identity_confirmed === 1,
      mapping: JSON.parse(row.mapping_json),
      catalog: JSON.parse(row.catalog_json),
      frameCount: row.frame_count,
      byteLength: row.byte_length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : null
  }

  setMotionPackBinding({ characterId = 'deepseek', packId, identityConfirmed = false, mapping } = {}) {
    this.#assertOpen()
    if (characterId !== 'deepseek') throw conflict('MOTION_CHARACTER_UNSUPPORTED', 'only the DeepSeek Whale character can be bound')
    if (identityConfirmed !== true) throw conflict('MOTION_IDENTITY_CONFIRMATION_REQUIRED', 'confirm that the selected artwork matches the Whale and is authorized before binding')
    const pack = this.getMotionPack(packId)
    if (!pack) throw conflict('MOTION_PACK_NOT_FOUND', 'motion pack does not exist')
    const allowedSlots = new Set([
      'idle', 'thinking', 'responding', 'patting', 'resting',
      'cheerful', 'shy', 'serious', 'confused', 'angry',
      'frightened', 'exasperated', 'starry',
    ])
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw conflict('MOTION_BINDING_INVALID', 'motion action mapping must be an object')
    }
    const normalized = {}
    for (const [slot, rawActionId] of Object.entries(mapping)) {
      if (!allowedSlots.has(slot)) throw conflict('MOTION_BINDING_SLOT_INVALID', 'unsupported motion mapping slot: ' + slot)
      if (rawActionId === null || rawActionId === undefined || rawActionId === '') continue
      if (typeof rawActionId !== 'string' || !pack.catalog.actions?.[rawActionId]) {
        throw conflict('MOTION_BINDING_ACTION_INVALID', 'mapping slot ' + slot + ' references an action not present in the imported pack')
      }
      normalized[slot] = rawActionId
    }
    if (!normalized.idle) throw conflict('MOTION_BINDING_IDLE_REQUIRED', 'an idle action must be selected before binding')
    const now = new Date().toISOString()
    const previous = this.getMotionPackBinding(characterId)
    this.transaction(() => {
      this.#db.prepare(`
        INSERT INTO motion_pack_bindings(character_id,pack_id,identity_confirmed,mapping_json,created_at,updated_at)
        VALUES(?,?,1,?,?,?)
        ON CONFLICT(character_id) DO UPDATE SET
          pack_id=excluded.pack_id,identity_confirmed=1,mapping_json=excluded.mapping_json,updated_at=excluded.updated_at
      `).run(characterId, String(packId), stableJson(normalized), previous?.createdAt || now, now)
      this.#recordAudit('motion-binding', characterId, 'MOTION_PACK_BOUND', null,
        previous ? { packId: previous.packId, mapping: previous.mapping } : null,
        { packId: String(packId), mapping: normalized },
        { identityConfirmed: true, displayName: pack.displayName, sourceHash: pack.sourceHash })
    })
    return this.getMotionPackBinding(characterId)
  }

  clearMotionPackBinding(characterId = 'deepseek') {
    this.#assertOpen()
    const previous = this.getMotionPackBinding(characterId)
    if (!previous) return { cleared: false, reason: 'MOTION_BINDING_NOT_FOUND' }
    this.transaction(() => {
      this.#db.prepare('DELETE FROM motion_pack_bindings WHERE character_id=?').run(String(characterId))
      this.#recordAudit('motion-binding', String(characterId), 'MOTION_PACK_UNBOUND', null,
        { packId: previous.packId, mapping: previous.mapping }, null,
        { displayName: previous.displayName, sourceHash: previous.sourceHash })
    })
    return { cleared: true, packId: previous.packId }
  }

  readMotionPackFrame(packId, relativePath) {
    this.#assertOpen()
    const path = String(relativePath || '')
    if (!/^action\/[A-Za-z0-9_-]+_[0-9]+\.png$/i.test(path) || path.includes('..')) {
      throw conflict('MOTION_PACK_PATH_INVALID', 'motion frame path is invalid')
    }
    const row = this.#db.prepare('SELECT sha256,byte_length FROM motion_pack_assets WHERE pack_id=? AND relative_path=?')
      .get(String(packId), path)
    if (!row) return null
    const absolute = join(this.assetDirectory, 'motion-packs', String(packId), path)
    let bytes
    try { bytes = readFileSync(absolute) } catch (cause) {
      const error = conflict('MOTION_PACK_FRAME_MISSING', 'stored motion frame is missing')
      error.cause = cause
      throw error
    }
    if (bytes.length !== row.byte_length || sha256(bytes) !== row.sha256) {
      throw conflict('MOTION_PACK_FRAME_HASH_MISMATCH', 'stored motion frame failed integrity verification')
    }
    return { bytes, mimeType: 'image/png', byteLength: row.byte_length, sha256: row.sha256 }
  }

  deleteMotionPack(packId, { confirmed = false } = {}) {
    this.#assertOpen()
    if (confirmed !== true) throw conflict('CONFIRMATION_REQUIRED', 'explicit motion pack removal confirmation is required')
    const pack = this.getMotionPack(packId)
    if (!pack) return { deleted: false, reason: 'MOTION_PACK_NOT_FOUND' }
    const parent = join(this.assetDirectory, 'motion-packs')
    const directory = join(parent, String(packId))
    if (!directory.startsWith(parent + '/') || String(packId).includes('/') || String(packId).includes('..')) {
      throw conflict('MOTION_PACK_PATH_INVALID', 'motion pack directory path is invalid')
    }
    const tombstone = join(parent, '.' + String(packId) + '.deleting')
    let moved = false
    if (existsSync(directory)) {
      renameSync(directory, tombstone)
      moved = true
    }
    try {
      this.transaction(() => {
        this.#db.prepare('DELETE FROM motion_packs WHERE pack_id=?').run(String(packId))
        this.#recordAudit('motion-pack', String(packId), 'MOTION_PACK_REMOVED', null, { sourceHash: pack.sourceHash }, null, {
          characterId: pack.characterId, frameCount: pack.frameCount, byteLength: pack.byteLength,
        })
      })
    } catch (error) {
      if (moved) { try { renameSync(tombstone, directory) } catch { /* preserve original error */ } }
      throw error
    }
    const cleanupErrors = []
    if (moved) { try { rmSync(tombstone, { recursive: true, force: true }) } catch (error) { cleanupErrors.push(error.message) } }
    return { deleted: true, packId: String(packId), cleanupErrors }
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
      sourceHash, sourcePath: '$', createdFiles, createdAssetIds, assets,
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
    this.#db.prepare('INSERT INTO migration_rollback_snapshots(migration_id,character_id,after_revision,created_asset_ids_json,status,created_at) VALUES(?,?,?,?,?,?)').run(migrationId,'deepseek',saved.revision,stableJson(createdAssetIds),'available',new Date().toISOString())
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

  listAuditEvents(aggregateKind, aggregateId, { limit = 50, before = null } = {}) {
    this.#assertOpen()
    const safeLimit = Math.max(1, Math.min(100, Number.isSafeInteger(limit) ? limit : 50))
    const rows = before
      ? this.#db.prepare('SELECT id,aggregate_kind,aggregate_id,event_type,source_event_id,before_hash,after_hash,details_json,created_at FROM audit_events WHERE aggregate_kind=? AND aggregate_id=? AND created_at < ? ORDER BY created_at DESC,id DESC LIMIT ?').all(String(aggregateKind),String(aggregateId),String(before),safeLimit)
      : this.#db.prepare('SELECT id,aggregate_kind,aggregate_id,event_type,source_event_id,before_hash,after_hash,details_json,created_at FROM audit_events WHERE aggregate_kind=? AND aggregate_id=? ORDER BY created_at DESC,id DESC LIMIT ?').all(String(aggregateKind),String(aggregateId),safeLimit)
    return rows.map(row => ({
      id: row.id,
      type: row.event_type,
      sourceEventId: row.source_event_id,
      beforeHash: row.before_hash,
      afterHash: row.after_hash,
      details: JSON.parse(row.details_json),
      createdAt: row.created_at,
    }))
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
