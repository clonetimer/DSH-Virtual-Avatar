import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCompanionInteraction, createGrowthState } from '../../src/characters/deepseek-whale/growth.mjs'

test('growth caps daily positive affection and records interaction streak', () => {
  let state = createGrowthState()
  for (let index = 0; index < 4; index++) {
    state = applyCompanionInteraction(state, { eventId: 'd1-' + index, delta: 1, occurredAt: '2026-11-11T0' + index + ':00:00.000Z' }).growth
  }
  assert.equal(state.affectionLifetime, 2)
  assert.equal(state.dailyBonusCount, 2)
  assert.equal(state.interactionStreak, 1)
  const next = applyCompanionInteraction(state, { eventId: 'd2-1', delta: 1, occurredAt: '2026-11-12T01:00:00.000Z' })
  assert.equal(next.growth.interactionStreak, 2)
  assert.equal(next.growth.affectionLifetime, 3)
})

test('growth events are idempotent and conflicting reuse is rejected', () => {
  const first = applyCompanionInteraction(createGrowthState(), { eventId: 'event-1', delta: 1 })
  assert.equal(applyCompanionInteraction(first.growth, { eventId: 'event-1', delta: 1 }).duplicate, true)
  assert.throws(() => applyCompanionInteraction(first.growth, { eventId: 'event-1', delta: -1 }), { code: 'GROWTH_EVENT_CONFLICT' })
})
