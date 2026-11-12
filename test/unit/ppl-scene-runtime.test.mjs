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
  assert.equal(legacyService.loadState().state.pplRuntime.state.emotion.anxiety, runtime().initialState().state.emotion.anxiety)
  assert.equal(legacyService.loadState().state.pplRuntime.state.emotion.grief, runtime().initialState().state.emotion.grief)
  assert.equal(legacyService.loadState().state.pplRuntime.state.emotion.anger, runtime().initialState().state.emotion.anger)
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
  assert.equal(classifyDeepseekWhaleEvent({ text: '我好累' }).type, 'USER_STRESS_DISCLOSURE')
  assert.equal(classifyDeepseekWhaleEvent({ text: '我今天很累' }).type, 'USER_STRESS_DISCLOSURE')
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


test('user stress disclosure and support requests are not misclassified as comfort given to the character', () => {
  const fatigue = classifyDeepseekWhaleEvent({ text: '我好累' })
  const pressure = classifyDeepseekWhaleEvent({ text: '最近工作压力很大' })
  const sadness = classifyDeepseekWhaleEvent({ text: '我有点难过' })
  const support = classifyDeepseekWhaleEvent({ text: '陪陪我' })
  const hugRequest = classifyDeepseekWhaleEvent({ text: '抱抱我' })
  const characterComfort = classifyDeepseekWhaleEvent({ text: '你辛苦了' })
  const rest = classifyDeepseekWhaleEvent({ text: '你休息一下吧' })
  const praise = classifyDeepseekWhaleEvent({ text: '你真棒' })

  assert.equal(fatigue.type, 'USER_STRESS_DISCLOSURE')
  assert.equal(fatigue.signal, 'fatigue')
  assert.equal(fatigue.subject, 'user')
  assert.equal(pressure.type, 'USER_STRESS_DISCLOSURE')
  assert.equal(pressure.signal, 'anxiety')
  assert.equal(sadness.type, 'USER_STRESS_DISCLOSURE')
  assert.equal(sadness.signal, 'sadness')
  assert.equal(support.type, 'USER_SUPPORT_REQUEST')
  assert.equal(hugRequest.type, 'USER_SUPPORT_REQUEST')
  assert.equal(characterComfort.type, 'COMFORT')
  assert.equal(characterComfort.subject, 'character')
  assert.equal(rest.type, 'CHARACTER_REST_ENCOURAGEMENT')
  assert.equal(praise.type, 'PRAISE')

  assert.equal(deepseekWhaleAffectionDelta({ event: fatigue }), 0)
  assert.equal(deepseekWhaleAffectionDelta({ event: support }), 0)
  assert.equal(deepseekWhaleAffectionDelta({ event: characterComfort }), 0)
  assert.equal(deepseekWhaleAffectionDelta({ event: rest }), 0)
  assert.equal(deepseekWhaleAffectionDelta({ event: praise }), 1)
})

test('PPL user stress disclosure activates supportive behavior without inflating relationship scores', () => {
  const ppl = runtime()
  const state = ppl.initialState()
  const userStress = classifyDeepseekWhaleEvent({ text: '我今天很累', eventId: 'stress-1' })
  const resolved = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: userStress,
  })

  assert.equal(resolved.resolution.resolved.behaviors.comforting_master.enabled, true)
  assert.ok(resolved.resolution.resolved.traits.warmth > 0.8)
  assert.ok(resolved.resolution.resolved.traits.playfulness < 0.7)
  assert.equal(resolved.resolution.pendingCommits.some(item => item.path.startsWith('relationships.admin.')), false)

  const incomplete = ppl.finalize(state, resolved.resolution, 'aborted')
  assert.equal(incomplete.committed, false)
  assert.equal(incomplete.runtimeState.relationships.admin.trust, state.relationships.admin.trust)

  const completed = ppl.finalize(state, resolved.resolution, 'completed')
  assert.equal(completed.runtimeState.relationships.admin.trust, state.relationships.admin.trust)
  assert.equal(completed.runtimeState.relationships.admin.attachment, state.relationships.admin.attachment)
  assert.ok(completed.runtimeState.state.emotion.anxiety < state.state.emotion.anxiety)
})

test('PPL praise and comfort evolve transient emotion state only after completed turns', () => {
  const ppl = runtime()
  const state = ppl.initialState()

  const praise = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: classifyDeepseekWhaleEvent({ text: '你真棒', eventId: 'praise-1' }),
  })
  const praised = ppl.finalize(state, praise.resolution, 'completed').runtimeState
  assert.ok(praised.state.emotion.embarrassment > state.state.emotion.embarrassment)
  assert.ok(praised.state.emotion.anxiety < state.state.emotion.anxiety)

  const comfort = ppl.resolve({
    runtimeState: praised,
    scene: 'PRIVATE_HOME',
    event: classifyDeepseekWhaleEvent({ text: '你辛苦了', eventId: 'comfort-1' }),
  })
  const comforted = ppl.finalize(praised, comfort.resolution, 'completed').runtimeState
  assert.ok(comforted.relationships.admin.trust > praised.relationships.admin.trust)
  assert.ok(comforted.state.emotion.anxiety < praised.state.emotion.anxiety)
  assert.ok(comforted.state.emotion.grief < praised.state.emotion.grief)
})

test('PPL rest encouragement reduces character fatigue without changing relationship trust', () => {
  const ppl = runtime()
  const state = ppl.initialState()
  state.state.physical.fatigue = 0.8
  const rest = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: classifyDeepseekWhaleEvent({ text: '你也休息一下吧', eventId: 'rest-1' }),
  })
  const rested = ppl.finalize(state, rest.resolution, 'completed').runtimeState

  assert.ok(rested.state.physical.fatigue < state.state.physical.fatigue)
  assert.equal(rested.relationships.admin.trust, state.relationships.admin.trust)
})

test('PPL negative interaction raises transient anger and does not commit on interrupted turns', () => {
  const ppl = runtime()
  const state = ppl.initialState()
  const negative = ppl.resolve({
    runtimeState: state,
    scene: 'PRIVATE_HOME',
    event: classifyDeepseekWhaleEvent({ text: '滚开', eventId: 'negative-1' }),
  })
  assert.ok(negative.resolution.pendingCommits.some(item => item.path === 'state.emotion.anger'))

  const interrupted = ppl.finalize(state, negative.resolution, 'aborted')
  assert.equal(interrupted.committed, false)
  assert.equal(interrupted.runtimeState.state.emotion.anger, state.state.emotion.anger)

  const completed = ppl.finalize(state, negative.resolution, 'completed').runtimeState
  assert.ok(completed.state.emotion.anger > state.state.emotion.anger)
})
