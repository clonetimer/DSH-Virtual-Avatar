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
    code: 'TRANSPORT',
    message: 'DeepSeek Messages transport failed',
    provider: 'openai-compatible',
    model: 'gpt-4o-mini',
  })
  assert.equal(provider.title, '模型传输失败')
  assert.equal(provider.provider, 'openai-compatible')
  assert.equal(provider.model, 'gpt-4o-mini')
})

test('chat failure guidance explains timeout and event-id conflicts without unsafe retries', () => {
  const timeout = helpers.describeChatFailure({ name: 'AbortError', message: 'model request timed out' })
  assert.equal(timeout.title, '模型响应超时')
  assert.equal(timeout.retryable, true)

  const streamTimeout = helpers.describeChatFailure({ code: 'LLM_STREAM_FAILED', message: 'model request timed out' })
  assert.equal(streamTimeout.title, '模型响应超时')

  const conflict = helpers.describeChatFailure({ code: 'EVENT_ID_CONFLICT', message: 'event id reused' })
  assert.equal(conflict.title, '消息请求编号冲突')
  assert.equal(conflict.retryable, false)
})

test('Whale model settings tests the selected draft before allowing save', () => {
  assert.match(source, /callApi\('model-test',\s*\{\s*provider:\s*modelDraftProvider,\s*model:\s*modelDraftModel\.trim\(\)\s*\}\)/u)
  assert.match(source, /modelTestBusy \|\| modelSaving \|\| modelCatalogBusy \|\| !modelDraftProvider \|\| !modelDraftModel\.trim\(\)/u)
  assert.match(source, /modelTestResult\?\.status !== 'success'.*modelTestResult\.provider !== modelDraftProvider.*modelTestResult\.model !== modelDraftModel\.trim\(\)/su)
  assert.doesNotMatch(source, /modelCatalog\.selection\.provider !== modelDraftProvider \|\| modelCatalog\.selection\.model !== modelDraftModel\.trim\(\)/u)
})

test('Whale utility overlay renders every settings panel reachable from More', () => {
  assert.match(source, /\['summary', 'profile', 'diagnostics', 'backups', 'memories', 'motion', 'model', 'background', 'help', 'ppl-config'\]\.includes\(activePanel\)/u)
})
