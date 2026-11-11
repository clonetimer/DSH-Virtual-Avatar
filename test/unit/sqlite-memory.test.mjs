import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'
import { MemoryService } from '../../src/memory/service.mjs'
import { extractMemoryCandidates } from '../../src/memory/candidates.mjs'

test('SQLite event ledger is idempotent and rejects reused ids with changed payload', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const first = store.applyAffectionEvent({ eventId: 'turn-1', delta: 1 })
    assert.equal(first.duplicate, false)
    assert.equal(first.state.affection, 1)
    const repeated = store.applyAffectionEvent({ eventId: 'turn-1', delta: 1 })
    assert.equal(repeated.duplicate, true)
    assert.equal(repeated.state.state.affection, 1)
    assert.throws(() => store.applyAffectionEvent({ eventId: 'turn-1', delta: -1 }), { code: 'EVENT_ID_CONFLICT' })
  } finally { store.close() }
})

test('SQLite persists state across close/reopen and checks optimistic revisions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-avatar-sqlite-'))
  const filename = join(dir, 'avatar.sqlite')
  try {
    const first = new SqliteAvatarStore(filename)
    const saved = first.saveCharacterState('deepseek', { level: 2, affection: 4 }, 0)
    assert.equal(saved.revision, 1)
    first.close()
    const second = new SqliteAvatarStore(filename)
    assert.deepEqual(second.loadCharacterState('deepseek').state, { affection: 4, level: 2 })
    assert.throws(() => second.saveCharacterState('deepseek', { level: 2, affection: 5 }, 0), { code: 'REVISION_CONFLICT' })
    second.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('memory service merges similar notes, deduplicates events and isolates owners', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const memory = new MemoryService({ store })
    const first = memory.addCandidate({
      ownerKind: 'character', ownerId: 'deepseek', eventId: 'mem-1',
      text: '主人喜欢海边的夜景', now: '2026-11-10T10:00:00.000Z',
    })
    assert.equal(first.merged, false)
    const merged = memory.addCandidate({
      ownerKind: 'character', ownerId: 'deepseek', eventId: 'mem-2',
      text: '主人很喜欢海边夜景', now: '2026-11-10T11:00:00.000Z',
    })
    assert.equal(merged.merged, true)
    assert.equal(merged.memory.hitCount, 1)
    const duplicate = memory.addCandidate({
      ownerKind: 'character', ownerId: 'deepseek', eventId: 'mem-2',
      text: '主人很喜欢海边夜景',
    })
    assert.equal(duplicate.duplicate, true)
    memory.addCandidate({
      ownerKind: 'shared', ownerId: 'user', eventId: 'mem-3',
      text: '用户偏好简洁说明',
    })
    assert.equal(memory.list({ ownerKind: 'character', ownerId: 'deepseek' }).length, 1)
    assert.equal(memory.list({ ownerKind: 'shared', ownerId: 'user' }).length, 1)
    assert.equal(memory.list({ ownerKind: 'character', ownerId: 'claude' }).length, 0)
    const pinned = memory.pin({ ownerKind: 'character', ownerId: 'deepseek', memoryId: first.memory.id, pinned: true })
    assert.equal(pinned.pinned, true)
    assert.equal(pinned.level, 'core')
    assert.equal(memory.remove({ ownerKind: 'character', ownerId: 'claude', memoryId: pinned.id }), false)
  } finally { store.close() }
})

test('memory context keeps pinned facts even when they exceed the prompt budget', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const memory = new MemoryService({ store })
    const item = memory.addCandidate({ ownerKind: 'character', ownerId: 'deepseek', eventId: 'pin-1', text: '必须保留的核心事实' })
    memory.pin({ ownerKind: 'character', ownerId: 'deepseek', memoryId: item.memory.id, pinned: true })
    memory.addCandidate({ ownerKind: 'character', ownerId: 'deepseek', eventId: 'edge-1', text: '这是一条普通的近期记忆' })
    const context = memory.buildContext({ ownerKind: 'character', ownerId: 'deepseek', maxChars: 2 })
    assert.equal(context.items.length, 1)
    assert.equal(context.items[0].pinned, true)
    assert.equal(context.pinnedOverflow, true)
  } finally { store.close() }
})


test('memory candidate extraction only suggests; it does not persist anything', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const candidates = extractMemoryCandidates('我喜欢海边的夜景，也正在做卫星仿真平台。')
    assert.ok(candidates.length >= 1)
    assert.equal(candidates.every(item => item.requiresConfirmation), true)
    assert.equal(store.listMemoryItems('character', 'deepseek').length, 0)
  } finally { store.close() }
})


test('backup verifies SQLite and media assets, then restores a consistent earlier snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-avatar-backup-'))
  const storage = join(dir, 'storage')
  const dbPath = join(storage, 'avatar.sqlite')
  const assets = join(storage, 'assets')
  const backupPath = join(storage, 'backups', 'backup-test')
  mkdirSync(assets, { recursive: true })
  try {
    const store = new SqliteAvatarStore(dbPath, { assetDirectory: assets })
    store.saveCharacterState('deepseek', { level: 2, affection: 5 }, 0)
    mkdirSync(join(assets, 'deepseek'), { recursive: true })
    writeFileSync(join(assets, 'deepseek', 'fixture.webp'), Buffer.from('media-fixture'))
    const created = store.createBackup(backupPath)
    assert.equal(created.schema, 'dsh-virtual-avatar.backup/1')
    assert.ok(created.fileCount >= 2)
    assert.equal(store.verifyBackup(backupPath).valid, true)

    store.saveCharacterState('deepseek', { level: 3, affection: 9 }, 1)
    assert.equal(store.loadCharacterState('deepseek').state.level, 3)
    const restored = store.restoreBackup(backupPath)
    assert.equal(restored.restored, true)
    assert.equal(store.loadCharacterState('deepseek').state.level, 2)
    assert.equal(readFileSync(join(assets, 'deepseek', 'fixture.webp'), 'utf8'), 'media-fixture')
    store.close()
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

test('backup verification rejects modified files before restore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-avatar-backup-corrupt-'))
  const dbPath = join(dir, 'avatar.sqlite')
  const backupPath = join(dir, 'backup')
  try {
    const store = new SqliteAvatarStore(dbPath, { assetDirectory: join(dir, 'assets') })
    store.saveCharacterState('deepseek', { level: 1 }, 0)
    store.createBackup(backupPath)
    writeFileSync(join(backupPath, 'avatar.sqlite'), Buffer.from('tampered'))
    assert.throws(() => store.verifyBackup(backupPath), { code: 'BACKUP_HASH_MISMATCH' })
    store.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
