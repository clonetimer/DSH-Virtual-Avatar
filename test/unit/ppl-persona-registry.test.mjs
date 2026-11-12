import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDeepseekWhalePersona } from '../../src/ppl/index.mjs'
import { createDefaultPersonaRegistry, PersonaRuntimeRegistry } from '../../src/ppl/registry.mjs'

test('default persona registry registers the DeepSeek Whale IR with a stable binding', () => {
  const registry = createDefaultPersonaRegistry()
  assert.equal(registry.has('DEEPSEEK_WHALE'), true)
  assert.deepEqual(registry.list().map(item => item.id), ['DEEPSEEK_WHALE'])

  const definition = registry.get('DEEPSEEK_WHALE')
  assert.equal(definition.version, '0.3.0')
  assert.equal(definition.binding.id, 'DEEPSEEK_WHALE')
  assert.equal(definition.hostKind, 'dsh-virtual-avatar/deepseek-whale')
  assert.equal(Object.hasOwn(definition, 'ir'), false)
})

test('persona registry creates isolated runtime adapters and state for each persona', () => {
  const registry = createDefaultPersonaRegistry()
  const secondIR = structuredClone(getDeepseekWhalePersona())
  secondIR.persona.id = 'TEST_PERSONA'
  secondIR.persona.version = '0.3.0-test'
  registry.register({ id: 'TEST_PERSONA', ir: secondIR, hostKind: 'test/second-persona' })

  const whale = registry.createRuntime('DEEPSEEK_WHALE')
  const second = registry.createRuntime('TEST_PERSONA')
  const whaleState = whale.initialState('whale-session')
  const secondState = second.initialState('second-session')

  assert.notEqual(whale, second)
  assert.notEqual(whale.ir, second.ir)
  assert.equal(whale.binding.id, 'DEEPSEEK_WHALE')
  assert.equal(second.binding.id, 'TEST_PERSONA')
  assert.equal(whaleState.session.id, 'whale-session')
  assert.equal(secondState.session.id, 'second-session')

  whaleState.relationships.admin.trust = 0.99
  whaleState.state.emotion.anxiety = 0.91
  assert.equal(secondState.relationships.admin.trust, 0.5)
  assert.equal(secondState.state.emotion.anxiety, 0.1)

  const whaleTurn = whale.resolve({
    runtimeState: whaleState,
    event: { type: 'MESSAGE', actor: 'admin' },
    scene: 'PUBLIC_SPACE',
  })
  assert.equal(whaleTurn.context.privacy, 'public')
  assert.equal(whaleTurn.snapshot.host.kind, 'dsh-virtual-avatar/deepseek-whale')
  assert.equal(secondState.relationships.admin.trust, 0.5)
})

test('persona registry rejects duplicate ids, invalid ids and IR id mismatches', () => {
  const registry = createDefaultPersonaRegistry()
  const whaleIR = getDeepseekWhalePersona()

  assert.throws(
    () => registry.register({ id: 'DEEPSEEK_WHALE', ir: whaleIR }),
    error => error.code === 'PPL_PERSONA_ALREADY_REGISTERED',
  )
  assert.throws(
    () => registry.register({ id: 'deepseek-whale', ir: whaleIR }),
    error => error.code === 'PPL_PERSONA_ID_INVALID',
  )
  assert.throws(
    () => registry.register({ id: 'ANOTHER_ID', ir: whaleIR }),
    error => error.code === 'PPL_IR_ID_MISMATCH',
  )
  assert.throws(
    () => registry.createRuntime('MISSING_PERSONA'),
    error => error.code === 'PPL_PERSONA_NOT_FOUND',
  )
})

test('persona registry unregister removes only the selected definition', () => {
  const registry = createDefaultPersonaRegistry()
  const secondIR = structuredClone(getDeepseekWhalePersona())
  secondIR.persona.id = 'TEMP_PERSONA'
  registry.register({ ir: secondIR })

  assert.equal(registry.unregister('TEMP_PERSONA'), true)
  assert.equal(registry.has('TEMP_PERSONA'), false)
  assert.equal(registry.has('DEEPSEEK_WHALE'), true)
})
