import assert from 'node:assert/strict'
import test from 'node:test'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'

test('PPL resolution failure audit stores structured diagnostics without raw user text or state mutation', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    store.recordPplResolutionFailure({
      eventId: 'ppl-failure-event-1',
      characterId: 'deepseek',
      persona: { id: 'DEEPSEEK_WHALE', version: '0.3.0', irSha256: 'b'.repeat(64) },
      event: {
        type: 'MESSAGE',
        actor: 'admin',
        subject: 'user',
        signal: 'stress',
        text: 'this raw text must not be copied into the PPL failure audit',
        classification: { method: 'deterministic', rule: 'test' },
      },
      scene: 'PUBLIC_SPACE',
      context: { privacy: 'public', outsiders_present: true, danger: 0.1 },
      error: Object.assign(new Error('CORE_TONE invariant failed'), {
        code: 'PPL_RESOLUTION_INVALID',
        diagnostics: [{ code: 'PPL-R601', severity: 'error', message: 'Invariant CORE_TONE violated.' }],
      }),
    })
    const events = store.listAuditEvents('ppl-runtime', 'deepseek', { limit: 10 })
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'PPL_RESOLUTION_REJECTED')
    assert.equal(events[0].sourceEventId, 'ppl-failure-event-1')
    assert.equal(events[0].details.status, 'rejected')
    assert.equal(events[0].details.error.code, 'PPL_RESOLUTION_INVALID')
    assert.equal(events[0].details.error.diagnostics[0].code, 'PPL-R601')
    assert.equal(events[0].details.context.privacy, 'public')
    assert.equal(Object.hasOwn(events[0].details.event, 'text'), false)
    assert.doesNotMatch(JSON.stringify(events[0].details), /this raw text must not be copied/)
    assert.equal(store.loadCharacterState('deepseek'), null)
  } finally {
    store.close()
  }
})
