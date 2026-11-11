import test from 'node:test'
import assert from 'node:assert/strict'
import { buildConversationContext } from '../../src/characters/deepseek-whale/context-window.mjs'

test('context window prioritizes continuity and most recent turns', () => {
  const history = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: 'turn-' + index }))
  const result = buildConversationContext({ history, storyContinuity: 'confirmed birthday fact', recentTurns: 12, maxChars: 300 })
  assert.match(result.continuity, /birthday/)
  assert.ok(result.messages.length > 0)
  assert.equal(result.messages.at(-1).content, 'turn-29')
  assert.equal(result.truncated, true)
})
