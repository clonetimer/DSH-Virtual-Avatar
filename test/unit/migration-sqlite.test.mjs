import test from 'node:test'
import assert from 'node:assert/strict'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'
import { MigrationCoordinator } from '../../src/migration/coordinator.mjs'

test('Whale migration imports DeepSeek state and defers other characters without discarding source', async () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const coordinator = new MigrationCoordinator({ store })
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
          customSprite: { dataUrl: 'data:image/png;base64,aGVsbG8=', fileName: 'sprite.png' },
          profileOverrides: { displayName: '鲸鱼娘' },
        },
        claude: { level: 5, affection: 22 },
        chatgpt: { level: 2, affection: 8 },
      },
      preferences: { enabled: true },
    })
    const preview = coordinator.preview([{ sourceKind: 'whale-galgame', raw }])
    assert.equal(preview.totalRecords, 1)
    assert.deepEqual(preview.sources[0].warnings, ['MEDIA_EXTRACTION_REQUIRED:1', 'DEFERRED_CHARACTERS:2'])
    const staged = coordinator.stage([{ sourceKind: 'whale-galgame', raw }])
    await assert.rejects(() => coordinator.commit(staged.id), { code: 'CONFIRMATION_REQUIRED' })
    const committed = await coordinator.commit(staged.id, { confirmed: true })
    assert.equal(committed.result.accepted.length, 1)
    assert.deepEqual(committed.result.warnings[0].deferredCharacters, ['claude', 'chatgpt'])
    const state = store.loadCharacterState('deepseek').state
    assert.equal(state.level, 3)
    assert.equal(state.affection, 12)
    assert.equal(state.conversation.log[0].text, 'hello')
    assert.equal(state.profileOverrides.displayName, '鲸鱼娘')
    const repeated = coordinator.preview([{ sourceKind: 'whale-galgame', raw }])
    assert.equal(repeated.sources[0].alreadyImported, true)
    assert.equal(repeated.totalRecords, 0)
  } finally { store.close() }
})
