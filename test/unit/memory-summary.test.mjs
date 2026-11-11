import test from 'node:test'
import assert from 'node:assert/strict'
import { createSummaryCandidate } from '../../src/characters/deepseek-whale/memory-summary.mjs'

test('summary candidate includes recent conversation and confirmed facts but never auto-confirms', () => {
  const result = createSummaryCandidate({
    history: [{ role: 'user', text: '我喜欢海边夜景', at: 1 }, { role: 'assistant', text: '我会记住这份偏好。', at: 2 }],
    currentMemory: { confirmedFacts: [{ text: '主人生日在五月' }], keyEvents: [{ title: '第一次一起看海' }] },
    memories: [{ text: '主人喜欢安静的环境' }],
    now: '2026-11-11T00:00:00.000Z',
  })
  assert.match(result.summary, /主人生日在五月/)
  assert.match(result.summary, /我喜欢海边夜景/)
  assert.equal(result.requiresUserConfirmation, true)
  assert.ok(result.sourceHash)
})

test('summary candidate includes expected revision for optimistic confirmation', () => {
  const result = createSummaryCandidate({
    history: [{ role: 'user', text: '我喜欢海边' }],
    currentMemory: { revision: 7, confirmedFacts: [{ text: '生日在五月' }] },
  })
  assert.equal(result.expectedRevision, 7)
  assert.equal(result.requiresUserConfirmation, true)
})
