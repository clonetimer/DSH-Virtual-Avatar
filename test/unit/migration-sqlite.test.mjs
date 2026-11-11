import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'
import { MigrationCoordinator } from '../../src/migration/coordinator.mjs'

function createStore() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-avatar-media-'))
  return {
    directory,
    store: new SqliteAvatarStore(':memory:', { assetDirectory: join(directory, 'assets') }),
    cleanup() { rmSync(directory, { recursive: true, force: true }) },
  }
}

test('Whale migration extracts DeepSeek media, verifies hashes and preserves the original source archive', async () => {
  const fixture = createStore()
  const { store } = fixture
  try {
    const coordinator = new MigrationCoordinator({ store })
    const image = 'data:image/png;base64,aGVsbG8='
    const raw = JSON.stringify({
      v: 9,
      current: 'deepseek',
      characters: {
        deepseek: {
          level: 3,
          affection: 12,
          log: [{ role: 'user', text: 'hello' }],
          chatLines: [{ who: 'heroine', text: '你好' }],
          choices: [{ id: 'c1', text: '继续', effect: 0 }],
          customSprite: { dataUrl: image, fileName: 'sprite.png' },
          cgs: [{ id: 'cg-1', dataUrl: image }],
          profileOverrides: { displayName: '鲸鱼娘' },
        },
        claude: { level: 5, affection: 22, customSprite: { dataUrl: image } },
        chatgpt: { level: 2, affection: 8 },
      },
      bg: image,
      preferences: { enabled: true },
    })
    const preview = coordinator.preview([{ sourceKind: 'whale-galgame', raw }])
    assert.equal(preview.totalRecords, 1)
    assert.deepEqual(preview.sources[0].warnings, [
      'MEDIA_EXTRACTION_REQUIRED:3',
      'DEFERRED_MEDIA_ASSETS:1',
      'DEFERRED_CHARACTERS:2',
    ])
    const staged = coordinator.stage([{ sourceKind: 'whale-galgame', raw }])
    await assert.rejects(() => coordinator.commit(staged.id), { code: 'CONFIRMATION_REQUIRED' })
    const committed = await coordinator.commit(staged.id, { confirmed: true })
    assert.equal(committed.result.accepted.length, 1)
    assert.deepEqual(committed.result.warnings[0].deferredCharacters, ['claude', 'chatgpt'])
    assert.equal(committed.result.warnings[0].mediaAssetsImported, 1)

    const state = store.loadCharacterState('deepseek').state
    assert.equal(state.level, 3)
    assert.equal(state.affection, 12)
    assert.equal(state.conversation.log[0].text, 'hello')
    assert.equal(state.profileOverrides.displayName, '鲸鱼娘')
    assert.match(state.customSprite.dataUrl, /^asset:\/\/dsh-virtual-avatar\/[a-f0-9]{64}$/)
    assert.equal(state.customSprite.dataUrl, state.cgs[0].dataUrl)
    assert.match(state.legacy.bg, /^asset:\/\/dsh-virtual-avatar\/[a-f0-9]{64}$/)

    const assets = store.listMediaAssets()
    assert.equal(assets.length, 1)
    assert.equal(assets[0].mimeType, 'image/png')
    assert.equal(assets[0].byteLength, 5)
    assert.ok(assets[0].relativePath.startsWith('deepseek/'))
    const loaded = store.readMediaAsset(assets[0].id)
    assert.equal(loaded.bytes.toString('utf8'), 'hello')
    assert.equal(loaded.asset.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')

    const archive = store.getMigrationSource('whale-galgame', preview.sources[0].sourceHash)
    assert.equal(archive.raw, raw)
    assert.match(archive.raw, /data:image\/png;base64,aGVsbG8=/)
    assert.equal(Object.prototype.hasOwnProperty.call(archive.inspection, 'parsed'), false)

    const repeated = coordinator.preview([{ sourceKind: 'whale-galgame', raw }])
    assert.equal(repeated.sources[0].alreadyImported, true)
    assert.equal(repeated.totalRecords, 0)
  } finally {
    store.close()
    fixture.cleanup()
  }
})

test('malformed or unsupported media aborts the migration without partial database writes', async () => {
  const fixture = createStore()
  const { store } = fixture
  try {
    const coordinator = new MigrationCoordinator({ store })
    const raw = JSON.stringify({
      characters: {
        deepseek: { customSprite: { dataUrl: 'data:image/png;base64,%%%invalid%%%' } },
      },
    })
    const staged = coordinator.stage([{ sourceKind: 'whale-galgame', raw }])
    await assert.rejects(
      () => coordinator.commit(staged.id, { confirmed: true }),
      { code: 'INVALID_MEDIA_DATA_URL' },
    )
    assert.equal(store.loadCharacterState('deepseek'), null)
    assert.equal(store.listMediaAssets().length, 0)
    assert.equal(store.getMigrationSource('whale-galgame', staged.preview.sources[0].sourceHash), null)
    assert.equal(coordinator.getStage(staged.id).status, 'staged')
  } finally {
    store.close()
    fixture.cleanup()
  }
})


test('new media files are removed if the SQLite migration transaction fails after extraction', async () => {
  const fixture = createStore()
  const { store, directory } = fixture
  const originalSave = store.saveCharacterState.bind(store)
  try {
    const coordinator = new MigrationCoordinator({ store })
    const raw = JSON.stringify({
      characters: {
        deepseek: { customSprite: { dataUrl: 'data:image/png;base64,aGVsbG8=' } },
      },
    })
    const staged = coordinator.stage([{ sourceKind: 'whale-galgame', raw }])
    store.saveCharacterState = () => { throw new Error('simulated character state write failure') }
    await assert.rejects(
      () => coordinator.commit(staged.id, { confirmed: true }),
      /simulated character state write failure/,
    )
    store.saveCharacterState = originalSave
    assert.equal(store.loadCharacterState('deepseek'), null)
    assert.equal(store.listMediaAssets().length, 0)
    assert.equal(store.getMigrationSource('whale-galgame', staged.preview.sources[0].sourceHash), null)
    const mediaDirectory = join(directory, 'assets', 'deepseek')
    assert.equal(existsSync(mediaDirectory), true)
    assert.deepEqual(readdirSync(mediaDirectory), [])
  } finally {
    store.saveCharacterState = originalSave
    store.close()
    fixture.cleanup()
  }
})


test('migration rollback restores pre-import absence and removes only assets created by that migration', async () => {
  const fixture = createStore()
  const { store } = fixture
  try {
    const coordinator = new MigrationCoordinator({ store })
    const image = 'data:image/png;base64,aGVsbG8='
    const raw = JSON.stringify({ characters: { deepseek: { level: 2, affection: 4, customSprite: { dataUrl: image } } } })
    const staged = coordinator.stage([{ sourceKind: 'whale-galgame', raw }])
    const committed = await coordinator.commit(staged.id, { confirmed: true })
    const migrationId = committed.id
    const preview = store.previewMigrationRollback(migrationId)
    assert.equal(preview.available, true)
    assert.equal(preview.createdAssetCount, 1)
    assert.equal(store.listMediaAssets().length, 1)
    await assert.rejects(
      () => store.rollbackMigration(migrationId),
      { code: 'CONFIRMATION_REQUIRED' },
    )
    const rolledBack = store.rollbackMigration(migrationId, { confirmed: true })
    assert.equal(rolledBack.status, 'rolled_back')
    assert.equal(rolledBack.removedAssetCount, 1)
    assert.equal(store.loadCharacterState('deepseek'), null)
    assert.equal(store.listMediaAssets().length, 0)
    assert.equal(store.previewMigrationRollback(migrationId).reason, 'ROLLBACK_ALREADY_USED')
  } finally {
    store.close()
    fixture.cleanup()
  }
})

test('migration rollback refuses to overwrite character state changed after import', async () => {
  const fixture = createStore()
  const { store } = fixture
  try {
    const coordinator = new MigrationCoordinator({ store })
    const raw = JSON.stringify({ characters: { deepseek: { level: 2, affection: 4 } } })
    const staged = coordinator.stage([{ sourceKind: 'whale-galgame', raw }])
    const committed = await coordinator.commit(staged.id, { confirmed: true })
    const migrationId = committed.id
    const imported = store.loadCharacterState('deepseek')
    store.saveCharacterState('deepseek', { ...imported.state, level: 3 }, imported.revision)
    const preview = store.previewMigrationRollback(migrationId)
    assert.equal(preview.available, false)
    assert.equal(preview.reason, 'POST_MIGRATION_STATE_CHANGED')
    await assert.rejects(
      () => store.rollbackMigration(migrationId, { confirmed: true }),
      { code: 'POST_MIGRATION_STATE_CHANGED' },
    )
    assert.equal(store.loadCharacterState('deepseek').state.level, 3)
  } finally {
    store.close()
    fixture.cleanup()
  }
})
