import test from 'node:test'
import assert from 'node:assert/strict'
import { MigrationCoordinator } from '../../src/migration/coordinator.mjs'

function memoryStore() {
  const imported = new Map()
  return {
    hasSource: (kind, hash) => imported.has(kind + ':' + hash),
    async commitMigration({ migrationId, sources }) {
      const accepted = []
      const duplicate = []
      for (const source of sources) {
        const key = source.sourceKind + ':' + source.sourceHash
        if (imported.has(key)) duplicate.push(key)
        else { imported.set(key, migrationId); accepted.push(key) }
      }
      return { accepted, duplicate }
    },
  }
}
const source = () => ({ sourceKind: 'virtual-person', raw: '# Persona\n\n## 记忆\n- 2026-10-28 13:20："核心事实"^3*；' })

test('migration requires explicit confirmation and commits staged sources once', async () => {
  const coordinator = new MigrationCoordinator({ store: memoryStore() })
  const preview = coordinator.preview([source()])
  assert.equal(preview.writesPerformed, false)
  assert.equal(preview.sources[0].alreadyImported, false)
  const staged = coordinator.stage([source()])
  await assert.rejects(() => coordinator.commit(staged.id), { code: 'CONFIRMATION_REQUIRED' })
  const committed = await coordinator.commit(staged.id, { confirmed: true })
  assert.equal(committed.status, 'committed')
  assert.equal(committed.result.accepted.length, 1)
  assert.equal(coordinator.getStage(staged.id).status, 'committed')
  await assert.rejects(() => coordinator.commit(staged.id, { confirmed: true }), { code: 'INVALID_STAGE_STATE' })
})

test('re-import preview identifies previously imported identical source', async () => {
  const coordinator = new MigrationCoordinator({ store: memoryStore() })
  const staged = coordinator.stage([source()])
  await coordinator.commit(staged.id, { confirmed: true })
  const preview = coordinator.preview([source()])
  assert.equal(preview.sources[0].alreadyImported, true)
  assert.equal(preview.totalRecords, 0)
})

test('discarded stage cannot be committed', async () => {
  const coordinator = new MigrationCoordinator({ store: memoryStore() })
  const staged = coordinator.stage([source()])
  assert.equal(coordinator.discard(staged.id), true)
  await assert.rejects(() => coordinator.commit(staged.id, { confirmed: true }), { code: 'INVALID_STAGE_STATE' })
})
