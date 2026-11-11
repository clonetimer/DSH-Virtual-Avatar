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
    assert.match(prepared.system, /日常陪伴对话场景/)
    assert.doesNotMatch(prepared.system, /Galgame/)
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


test('confirmed story facts are persisted and injected into later companion turns', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    const confirmed = service.addConfirmedStoryFact({
      id: 'birthday-fact',
      text: '主人的生日在五月',
      sourceEventId: 'user-confirmed-birthday',
      category: 'preference',
    })
    assert.equal(confirmed.duplicate, false)
    const prepared = service.prepareTurn({
      text: '你还记得吗？',
      eventId: 'story-context-turn',
      sessionId: 'story-session',
    })
    assert.match(prepared.system, /主人的生日在五月/)
    assert.match(prepared.system, /已确认的用户事实/)
    assert.equal(service.getStoryMemory().confirmedFacts.length, 1)
  } finally {
    store.close()
  }
})

test('prepared turn retrieves relevant pinned memories and bounds recent context', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    service.remember('主人喜欢海边的夜景', { eventId: 'memory-seaside-1' })
    service.remember('主人正在学习 Rust 编程', { eventId: 'memory-rust-1' })
    const memories = service.listMemories()
    service.pinMemory(memories[0].id, true)
    const prepared = service.prepareTurn({
      text: '你还记得我喜欢海边吗？',
      eventId: 'context-retrieval-1',
    })
    assert.ok(prepared.memoryContext.items.length >= 1)
    assert.ok(prepared.memoryContext.items.some(item => item.text.includes('海边')))
    assert.ok(prepared.contextMessages.length <= 12)
    assert.ok(prepared.contextDiagnostics.estimatedChars <= 14000)
    assert.equal(prepared.contextDiagnostics.includedMessages, prepared.contextMessages.length)
  } finally { store.close() }
})

test('summary candidates include source hash and current revision without overwriting memory', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    service.addConfirmedStoryFact({ id: 'fact-summary-1', text: '主人喜欢夜景', sourceEventId: 'fact-source-1' })
    const candidate = service.createMemorySummaryCandidate({ now: '2026-11-11T00:00:00.000Z' })
    assert.match(candidate.summary, /主人喜欢夜景/)
    assert.equal(candidate.requiresUserConfirmation, true)
    assert.equal(candidate.expectedRevision, 1)
    assert.equal(service.getStoryMemory().summary, '')
  } finally { store.close() }
})


test('daily positive growth cap is enforced by committed companion turns', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    for (let index = 0; index < 4; index++) {
      const prepared = service.prepareTurn({
        text: '我喜欢和你聊天',
        eventId: 'daily-growth-' + index,
        sessionId: 'daily-growth-session',
      })
      const result = service.finalizeTurn(prepared, {
        reply: '我也很开心能陪着主人。',
        occurredAt: '2026-11-11T0' + index + ':00:00.000Z',
      })
      assert.equal(result.affectionDelta, index < 2 ? 1 : 0)
    }
    const state = service.loadState().state
    assert.equal(state.affection, 2)
    assert.equal(state.growth.affectionLifetime, 2)
    assert.equal(state.growth.dailyBonusCount, 2)

    const nextDay = service.prepareTurn({
      text: '今天也喜欢和你聊天',
      eventId: 'daily-growth-next-day',
      sessionId: 'daily-growth-session',
    })
    service.finalizeTurn(nextDay, {
      reply: '新的一天也要一起加油哦。',
      occurredAt: '2026-11-12T01:00:00.000Z',
    })
    assert.equal(service.loadState().state.affection, 3)
    assert.equal(service.loadState().state.growth.interactionStreak, 2)
  } finally {
    store.close()
  }
})


test('explicit rejection is negative and does not grant positive affection', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    const prepared = service.prepareTurn({
      text: '我不喜欢你',
      eventId: 'negative-companion-turn',
      sessionId: 'negative-companion-session',
    })
    assert.equal(prepared.event.type, 'NEGATIVE_INTERACTION')
    const result = service.finalizeTurn(prepared, {
      reply: '我知道了，会尊重主人的感受。',
      occurredAt: '2026-11-11T12:00:00.000Z',
    })
    assert.equal(result.requestedAffectionDelta, -1)
    assert.equal(result.affectionDelta, -1)
    const state = service.loadState().state
    assert.equal(state.affection, 0)
    assert.equal(state.relationship.attachment, 0.095)
  } finally {
    store.close()
  }
})
