import test from 'node:test'
import assert from 'node:assert/strict'
import { DeepseekWhaleService } from '../../src/characters/deepseek-whale/service.mjs'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'

test('DeepSeek Whale companion turn is prepared, committed once and durably reloaded', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    const prepared = service.prepareTurn({
      text: '今天辛苦了',
      eventId: 'whale-turn-1',
      sessionId: 'whale-session',
      turn: 1,
    })
    assert.match(prepared.system, /DeepSeek 鲸鱼娘/)
    assert.match(prepared.system, /Galgame 陪伴场景/)
    assert.equal(prepared.event.type, 'COMFORT')

    const aborted = service.finalizeTurn(prepared, { reply: '先等等', terminalReason: 'aborted' })
    assert.equal(aborted.committed, false)
    assert.equal(store.loadCharacterState('deepseek'), null)

    const completedPrepared = service.prepareTurn({
      text: '今天辛苦了',
      eventId: 'whale-turn-2',
      sessionId: 'whale-session',
      turn: 1,
    })
    const completed = service.finalizeTurn(completedPrepared, { reply: '主人也辛苦啦，我一直在这里哦。' })
    assert.equal(completed.committed, true)
    assert.equal(completed.state.relationship.trust, 0.51)
    assert.equal(completed.state.relationship.attachment, 0.105)
    assert.equal(completed.state.conversation.log.length, 2)
    assert.equal(completed.state.conversation.chatLines.length, 2)

    const duplicate = service.finalizeTurn(completedPrepared, { reply: '主人也辛苦啦，我一直在这里哦。' })
    assert.equal(duplicate.duplicate, true)
    assert.equal(service.loadState().state.conversation.log.length, 2)
  } finally {
    store.close()
  }
})
