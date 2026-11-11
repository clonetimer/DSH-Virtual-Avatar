import test from 'node:test'
import assert from 'node:assert/strict'
import { buildConversationContext } from '../../src/characters/deepseek-whale/context-window.mjs'

test('context window prioritizes continuity and most recent messages', () => {
  const history = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: 'turn-' + index }))
  const result = buildConversationContext({ history, continuity: 'confirmed birthday fact', recentMessages: 12, maxChars: 300 })
  assert.match(result.continuity, /birthday/)
  assert.ok(result.messages.length > 0)
  assert.equal(result.messages.at(-1).content, 'turn-29')
  assert.equal(result.truncated, true)
})

test('context window reserves budget for continuity and relevant memories before recent messages', () => {
  const result = buildConversationContext({
    history: Array.from({ length: 20 }, (_, index) => ({ role: 'user', text: 'message-' + index })),
    continuity: 'confirmed facts: birthday in May',
    memories: [{ text: 'prefers concise answers' }],
    recentMessages: 12,
    maxChars: 300,
  })
  assert.match(result.continuity, /birthday/)
  assert.match(result.continuity, /concise/)
  assert.equal(result.messages.at(-1).content, 'message-19')
  assert.ok(result.estimatedChars <= 300)
})
