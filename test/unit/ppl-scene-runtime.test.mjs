import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DeepseekWhaleService } from '../../src/characters/deepseek-whale/service.mjs'
import {
  classifyDeepseekWhaleEvent,
  createDeepseekWhaleInitialState,
  deepseekWhaleAffectionDelta,
} from '../../src/characters/deepseek-whale/relationship.mjs'
import {
  buildDeepseekWhaleSystemPrompt,
  relationshipStageLabel,
} from '../../src/characters/deepseek-whale/profile.mjs'
import { createDeepseekWhaleRuntime } from '../../src/ppl/index.mjs'

function createMemoryStore(initial = null) {
  let row = initial ? { state: structuredClone(initial), revision: 1 } : null
  return {
    loadCharacterState() {
      return row ? structuredClone(row) : null
    },
    saveCharacterState(_id, state, expectedRevision) {
      const currentRevision = row?.revision || 0
      if (currentRevision !== expectedRevision) {
        const error = new Error('character revision conflict')
        error.code = 'REVISION_CONFLICT'
        throw error
      }
      row = { state: structuredClone(state), revision: currentRevision + 1 }
      return { state: structuredClone(row.state), revision: row.revision }
    },
    commitCharacterTurn() {
      throw new Error('not used by scene persistence tests')
    },
    listMemoryItems() {
      return []
    },
  }
}

const runtime = () => createDeepseekWhaleRuntime()
const event = type => ({ type, actor: 'admin', eventId: 'ppl-test:' + type })

test('PPL PRIVATE_HOME and PUBLIC_SPACE scenes are applied per turn', () => {
  const ppl = runtime()
  const state = ppl.initialState()

  const privateTurn = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: event('MESSAGE'),
  })
  const publicTurn = ppl.resolve({
    runtimeState: state,
    scene: 'PUBLIC_SPACE',
    event: event('MESSAGE'),
  })

  assert.equal(privateTurn.context.privacy, 'private')
  assert.equal(privateTurn.context.outsiders_present, false)
  assert.equal(publicTurn.context.privacy, 'public')
  assert.equal(publicTurn.context.outsiders_present, true)
})

test('PPL private and public behavior rules produce different resolved states', () => {
  const ppl = runtime()
  const state = ppl.initialState()
  state.relationships.admin.stage = 'lover'
  state.relationships.admin.trust = 0.9
  state.state.physical.fatigue = 0.8

  const privateTurn = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: event('MESSAGE'),
  })
  const publicTurn = ppl.resolve({
    runtimeState: state,
    scene: 'PUBLIC_SPACE',
    event: event('MESSAGE'),
  })

  assert.equal(privateTurn.resolution.resolved.behaviors.private_closeness.enabled, true)
  assert.equal(privateTurn.resolution.resolved.behaviors.public_mode.enabled, false)
  assert.equal(publicTurn.resolution.resolved.behaviors.private_closeness.enabled, false)
  assert.equal(publicTurn.resolution.resolved.behaviors.public_mode.enabled, true)
})

test('PPL relationship advances from acquaintance to trusted and then close', () => {
  const ppl = runtime()
  const state = ppl.initialState()
  state.relationships.admin.trust = 0.7
  state.relationships.admin.attachment = 0.3

  const trusted = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: event('MESSAGE'),
  })
  assert.ok(trusted.resolution.pendingTransitions.some(item => item.to === 'trusted'))
  const trustedState = ppl.finalize(state, trusted.resolution, 'completed').runtimeState
  assert.equal(trustedState.relationships.admin.stage, 'trusted')

  trustedState.relationships.admin.trust = 0.82
  trustedState.relationships.admin.attachment = 0.5
  const close = ppl.resolve({
    runtimeState: trustedState,
    scene: 'PRIVATE_HOME',
    event: event('MESSAGE'),
  })
  assert.ok(close.resolution.pendingTransitions.some(item => item.to === 'close'))
  const closeState = ppl.finalize(trustedState, close.resolution, 'completed').runtimeState
  assert.equal(closeState.relationships.admin.stage, 'close')
})

test('PPL confession first enters confession stage when trust is insufficient', () => {
  const ppl = runtime()
  const state = ppl.initialState()
  state.relationships.admin.trust = 0.6
  state.relationships.admin.attachment = 0.3

  const pending = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: event('CONFESSION'),
  })
  assert.deepEqual(pending.resolution.pendingTransitions.map(item => item.to), ['confession'])
  const confessionState = ppl.finalize(state, pending.resolution, 'completed').runtimeState
  assert.equal(confessionState.relationships.admin.stage, 'confession')

  confessionState.relationships.admin.trust = 0.8
  const accepted = ppl.resolve({
    runtimeState: confessionState,
    scene: 'PRIVATE_HOME',
    event: event('CONFESSION'),
  })
  assert.deepEqual(accepted.resolution.pendingTransitions.map(item => item.to), ['lover'])
  const loverState = ppl.finalize(confessionState, accepted.resolution, 'completed').runtimeState
  assert.equal(loverState.relationships.admin.stage, 'lover')
})

test('interaction scene persists and legacy states default to PRIVATE_HOME', () => {
  const store = createMemoryStore()
  const service = new DeepseekWhaleService({ store })

  assert.equal(service.loadState().state.interactionScene, 'PRIVATE_HOME')
  const changed = service.setInteractionScene('PUBLIC_SPACE')
  assert.equal(changed.changed, true)
  assert.equal(service.loadState().state.interactionScene, 'PUBLIC_SPACE')

  const legacy = createDeepseekWhaleInitialState()
  delete legacy.interactionScene
  const legacyService = new DeepseekWhaleService({ store: createMemoryStore(legacy) })
  assert.equal(legacyService.loadState().state.interactionScene, 'PRIVATE_HOME')
})

test('DeepseekWhaleService passes the persisted scene into each PPL turn', () => {
  const store = createMemoryStore()
  const service = new DeepseekWhaleService({
    store,
    memoryService: { retrieveContext: () => ({ items: [] }) },
    pplRuntime: runtime(),
  })
  service.setInteractionScene('PUBLIC_SPACE')

  const prepared = service.prepareTurn({
    text: '你好',
    eventId: 'scene-turn-1',
    sessionId: 'deepseek-whale-default',
  })

  assert.equal(prepared.interactionScene, 'PUBLIC_SPACE')
  assert.equal(prepared.context.privacy, 'public')
  assert.equal(prepared.context.outsiders_present, true)
  assert.equal(prepared.pplSnapshot.context.privacy, 'public')
})

test('interaction scene rejects unsupported values and does not rewrite unchanged state', () => {
  const store = createMemoryStore()
  const service = new DeepseekWhaleService({ store })
  const unchanged = service.setInteractionScene('PRIVATE_HOME')
  assert.equal(unchanged.changed, false)
  assert.throws(() => service.setInteractionScene('GALGAME_CG'), error => error.code === 'INVALID_INTERACTION_SCENE')
})

test('event classification is shared by PPL and affection and avoids common false positives', () => {
  assert.equal(classifyDeepseekWhaleEvent({ text: '我真的很喜欢你' }).type, 'CONFESSION')
  assert.equal(classifyDeepseekWhaleEvent({ text: '辛苦了' }).type, 'COMFORT')
  assert.equal(classifyDeepseekWhaleEvent({ text: '抱抱' }).type, 'POSITIVE_INTERACTION')
  assert.equal(classifyDeepseekWhaleEvent({ text: '早安' }).type, 'MESSAGE')
  assert.equal(classifyDeepseekWhaleEvent({ text: '晚安' }).type, 'MESSAGE')
  assert.equal(classifyDeepseekWhaleEvent({ text: '我不累' }).type, 'MESSAGE')
  assert.equal(classifyDeepseekWhaleEvent({ text: '我不喜欢你这种说法' }).type, 'MESSAGE')

  const confession = classifyDeepseekWhaleEvent({ text: '我真的很喜欢你' })
  const comfort = classifyDeepseekWhaleEvent({ text: '你辛苦了' })
  const positive = classifyDeepseekWhaleEvent({ text: '抱抱' })
  assert.equal(deepseekWhaleAffectionDelta({ event: confession }), 1)
  assert.equal(deepseekWhaleAffectionDelta({ event: comfort }), 0)
  assert.equal(deepseekWhaleAffectionDelta({ event: positive }), 1)
  assert.equal(deepseekWhaleAffectionDelta({ event: event('NEGATIVE_INTERACTION') }), -1)
})

test('relationship stage, not affection level, governs intimacy prompt', () => {
  const prompt = buildDeepseekWhaleSystemPrompt({
    characterState: {
      level: 5,
      affection: 10,
      relationship: { stage: 'acquaintance' },
    },
  })
  assert.equal(relationshipStageLabel('acquaintance'), '初识')
  assert.match(prompt, /关系阶段：初识/)
  assert.match(prompt, /你们刚认识/)
  assert.match(prompt, /好感度等级仅用于成长反馈/)
  assert.doesNotMatch(prompt, /非常亲昵，像恋人一样/)

  const runtimeAuthoritativePrompt = buildDeepseekWhaleSystemPrompt({
    characterState: {
      level: 5,
      affection: 10,
      relationship: { stage: 'acquaintance' },
      pplRuntime: { relationships: { admin: { stage: 'lover' } } },
    },
  })
  assert.match(runtimeAuthoritativePrompt, /关系阶段：恋人/)
  assert.match(runtimeAuthoritativePrompt, /你们已经成为恋人/)
})
