import test from 'node:test'
import assert from 'node:assert/strict'
import { runSourceTests } from '../../src/ppl/vendor/pplc/runtime.js'
import { createDeepseekWhaleRuntime, getDeepseekWhalePersona } from '../../src/ppl/index.mjs'

test('DeepSeek Whale PPL 0.3 artifact loads and all embedded source tests pass', () => {
  const ir = getDeepseekWhalePersona()
  assert.equal(ir.schema, 'ppl.persona-ir/0.3')
  assert.equal(ir.persona.id, 'DEEPSEEK_WHALE')
  const results = runSourceTests(ir)
  assert.equal(results.failed, 0, JSON.stringify(results.results.filter(item => !item.passed), null, 2))
  assert.equal(results.passed, 7)
})

test('PPL relationship commits are staged and only applied for completed turns', () => {
  const runtime = createDeepseekWhaleRuntime()
  const before = runtime.initialState('whale-test')
  const prepared = runtime.resolve({
    runtimeState: before,
    event: { type: 'COMFORT', actor: 'admin', text: '辛苦了' },
    context: { privacy: 'private', outsiders_present: false },
    turn: 1,
    step: 1,
  })
  assert.equal(prepared.resolution.valid, true)
  assert.ok(prepared.resolution.pendingCommits.some(item => item.path === 'relationships.admin.trust'))
  const aborted = runtime.finalize(before, prepared.resolution, 'aborted')
  assert.equal(aborted.committed, false)
  assert.equal(aborted.runtimeState.relationships.admin.trust, 0.5)
  const completed = runtime.finalize(before, prepared.resolution, 'completed')
  assert.equal(completed.committed, true)
  assert.equal(completed.runtimeState.relationships.admin.trust, 0.51)
  assert.equal(completed.runtimeState.relationships.admin.attachment, 0.105)
})

test('PPL confession transition requires trust threshold and commits after the turn', () => {
  const runtime = createDeepseekWhaleRuntime()
  const before = runtime.initialState('whale-confession')
  before.relationships.admin.trust = 0.8
  const prepared = runtime.resolve({
    runtimeState: before,
    event: { type: 'CONFESSION', actor: 'admin', text: '我喜欢你' },
    context: { privacy: 'private', outsiders_present: false },
  })
  assert.equal(prepared.resolution.pendingTransitions[0]?.to, 'lover')
  const after = runtime.finalize(before, prepared.resolution, 'completed')
  assert.equal(after.runtimeState.relationships.admin.stage, 'lover')
})
