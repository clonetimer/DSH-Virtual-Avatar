import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Script } from 'node:vm'

const source = readFileSync(new URL('../../src/client/companion.mjs', import.meta.url), 'utf8')
const start = source.indexOf('function createChatEventId(')
const end = source.indexOf('\n\nconst MOTION_BINDING_SLOTS', start)
assert.ok(start > 0 && end > start, 'chat retry helpers exist in the client source')
const helpers = new Script(
  source.slice(start, end) + '\n({ createChatEventId, describeChatFailure })',
  { filename: 'chat-recovery-helpers.js' },
).runInNewContext({
  crypto: { randomUUID: () => '12345678-1234-4234-8234-123456789abc' },
  Date,
  Math,
})

test('chat event ids are stable-format identifiers suitable for safe retries', () => {
  const id = helpers.createChatEventId()
  assert.match(id, /^whale-chat-[a-z0-9-]+$/u)
  assert.ok(id.length < 160)
})

test('chat failure guidance distinguishes model setup, network and provider failures', () => {
  const missing = helpers.describeChatFailure({ code: 'MODEL_NOT_CONFIGURED', message: 'No model selected' })
  assert.equal(missing.title, '聊天模型尚未就绪')
  assert.equal(missing.retryable, false)
  assert.equal(missing.suggestedAction, 'model')

  const network = helpers.describeChatFailure({ name: 'TypeError', message: 'Failed to fetch' })
  assert.equal(network.title, '无法连接 DSH Host')
  assert.equal(network.retryable, true)

  const provider = helpers.describeChatFailure({
    code: 'LLM_STREAM_FAILED',
    message: 'provider rejected the request',
    provider: 'openai-compatible',
    model: 'gpt-4o-mini',
  })
  assert.equal(provider.title, '模型服务连接中断')
  assert.equal(provider.provider, 'openai-compatible')
  assert.equal(provider.model, 'gpt-4o-mini')
})

test('chat failure guidance explains timeout and event-id conflicts without unsafe retries', () => {
  const timeout = helpers.describeChatFailure({ name: 'AbortError', message: 'model request timed out' })
  assert.equal(timeout.title, '模型响应超时')
  assert.equal(timeout.retryable, true)

  const conflict = helpers.describeChatFailure({ code: 'EVENT_ID_CONFLICT', message: 'event id reused' })
  assert.equal(conflict.title, '消息请求编号冲突')
  assert.equal(conflict.retryable, false)
})
