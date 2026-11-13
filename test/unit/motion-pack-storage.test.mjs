import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'

const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,1,2,3,4])
const petConfig = { default: 'idle', patpat: 'pat' }
const actConfig = {
  idle: { images: 'stand', act_num: 1, frame_refresh: 0.2 },
  pat: { images: 'pat', act_num: 2, frame_refresh: 0.1 },
}
const catalog = {
  schema: 'dsh.dyberpet-motion/1',
  defaultAction: 'idle',
  actions: {
    idle: { frames: ['action/stand_0.png'], frameCount: 1, repeats: 1, frameIntervalMs: 200 },
    pat: { frames: ['action/pat_0.png'], frameCount: 1, repeats: 2, frameIntervalMs: 100 },
  },
}
const frames = [
  { path: 'action/stand_0.png', bytes: PNG },
  { path: 'action/pat_0.png', bytes: PNG },
]

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-motion-pack-'))
  const filename = join(directory, 'avatar.sqlite')
  const assetDirectory = join(directory, 'assets')
  return { directory, filename, assetDirectory, store: new SqliteAvatarStore(filename, { assetDirectory }) }
}

test('motion pack import persists configs and PNG frames across SQLite reopen', () => {
  const f = fixture()
  try {
    const imported = f.store.importMotionPack({ displayName: 'Whale Motion', petConfig, actConfig, catalog, frames })
    assert.equal(imported.duplicate, false)
    assert.equal(imported.pack.frameCount, 2)
    assert.equal(imported.pack.byteLength, PNG.length * 2)
    assert.equal(f.store.listMotionPacks().length, 1)
    assert.deepEqual(f.store.readMotionPackFrame(imported.pack.id, 'action/stand_0.png').bytes, PNG)
    const duplicate = f.store.importMotionPack({ displayName: 'Whale Motion', petConfig, actConfig, catalog, frames })
    assert.equal(duplicate.duplicate, true)
    assert.equal(duplicate.pack.id, imported.pack.id)
    f.store.close()
    f.store = new SqliteAvatarStore(f.filename, { assetDirectory: f.assetDirectory })
    const restored = f.store.getMotionPack(imported.pack.id)
    assert.equal(restored.displayName, 'Whale Motion')
    assert.deepEqual(f.store.readMotionPackFrame(imported.pack.id, 'action/pat_0.png').bytes, PNG)
    const backup = f.store.createBackup(join(f.directory, 'backup'))
    assert.equal(f.store.verifyBackup(join(f.directory, 'backup')).valid, true)
    assert.ok(backup.manifest.files.some(item => item.path.includes('assets/motion-packs/')))
    const removedBeforeRestore = f.store.deleteMotionPack(imported.pack.id, { confirmed: true })
    assert.equal(removedBeforeRestore.deleted, true)
    assert.equal(f.store.listMotionPacks().length, 0)
    const restoredBackup = f.store.restoreBackup(join(f.directory, 'backup'))
    assert.equal(restoredBackup.restored, true)
    assert.equal(f.store.listMotionPacks().length, 1)
    assert.deepEqual(f.store.readMotionPackFrame(imported.pack.id, 'action/stand_0.png').bytes, PNG)
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }) }
})

test('motion pack rejects unsafe paths and invalid PNG bytes before persistence', () => {
  const f = fixture()
  try {
    assert.throws(() => f.store.importMotionPack({ displayName: 'bad', petConfig, actConfig, catalog, frames: [{ path: '../stand_0.png', bytes: PNG }] }), { code: 'MOTION_PACK_PATH_INVALID' })
    assert.throws(() => f.store.importMotionPack({ displayName: 'bad', petConfig, actConfig, catalog, frames: [{ path: 'action/stand_0.png', bytes: Buffer.from('not png') }] }), { code: 'MOTION_PACK_PNG_INVALID' })
    assert.equal(f.store.listMotionPacks().length, 0)
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }) }
})

test('motion pack frame reads detect tampering and confirmed removal deletes files', () => {
  const f = fixture()
  try {
    const imported = f.store.importMotionPack({ displayName: 'Tamper test', petConfig, actConfig, catalog, frames })
    const framePath = join(f.assetDirectory, 'motion-packs', imported.pack.id, 'action', 'stand_0.png')
    writeFileSync(framePath, Buffer.from('tampered'))
    assert.throws(() => f.store.readMotionPackFrame(imported.pack.id, 'action/stand_0.png'), { code: 'MOTION_PACK_FRAME_HASH_MISMATCH' })
    assert.throws(() => f.store.deleteMotionPack(imported.pack.id), { code: 'CONFIRMATION_REQUIRED' })
    writeFileSync(framePath, PNG)
    const removed = f.store.deleteMotionPack(imported.pack.id, { confirmed: true })
    assert.equal(removed.deleted, true)
    assert.equal(f.store.getMotionPack(imported.pack.id), null)
    assert.equal(existsSync(join(f.assetDirectory, 'motion-packs', imported.pack.id)), false)
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }) }
})

test('motion pack deletion returns a stable not-found result for repeated uninstall', () => {
  const f = fixture()
  try {
    const removed = f.store.deleteMotionPack('00000000-0000-4000-8000-000000000000', { confirmed: true })
    assert.deepEqual(removed, { deleted: false, reason: 'MOTION_PACK_NOT_FOUND' })
  } finally { f.store.close(); rmSync(f.directory, { recursive: true, force: true }) }
})
