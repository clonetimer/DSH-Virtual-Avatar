import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Script } from 'node:vm'

const source = readFileSync(new URL('../../src/client/companion.mjs', import.meta.url), 'utf8')
const start = source.indexOf('function resolveBoundMotionAction(')
const end = source.indexOf('\n\nfunction describeCharacterState', start)
assert.ok(start > 0 && end > start, 'bound motion resolver exists in the client source')
const resolveBoundMotionAction = new Script(source.slice(start, end) + '\nresolveBoundMotionAction',
  { filename: 'client-motion-binding.js' }).runInNewContext({})

const helperStart = source.indexOf('function describeMotionActionOption(')
const helperEnd = source.indexOf('\n\nfunction resolveBoundMotionAction', helperStart)
assert.ok(helperStart > 0 && helperEnd > helperStart, 'motion mapping helpers exist in the client source')
const { describeMotionActionOption, suggestMotionBinding } = new Script(
  source.slice(helperStart, helperEnd) + '\n({ describeMotionActionOption, suggestMotionBinding })',
  { filename: 'client-motion-suggestions.js' },
).runInNewContext({})

const binding = {
  identityConfirmed: true,
  mapping: { idle: 'idle', thinking: 'think', responding: 'talk', patting: 'pat', resting: 'rest', shy: 'shy', angry: 'angry' },
  catalog: {
    defaultAction: 'idle',
    actions: Object.fromEntries(['idle', 'think', 'talk', 'pat', 'rest', 'shy', 'angry'].map(id => [id, { id }])),
  },
}

test('DyberPet native metadata suggests core and PPL motion mappings', () => {
  const ids = [
    'stand', 'focus', 'pat_soft', 'pat_hard', 'talk', 'sleep',
    'happy', 'shy', 'serious', 'confused', 'angry', 'frightened',
    'exasperated', 'starry',
  ]
  const catalog = {
    defaultAction: 'stand',
    bindings: { focus: 'focus', patpatByTier: { '1': 'pat_hard', '0': 'pat_soft' } },
    actions: Object.fromEntries(ids.map(id => [id, { id, frameCount: 4, durationMs: 800 }])),
  }
  const mapping = suggestMotionBinding(catalog)
  assert.equal(mapping.idle, 'stand')
  assert.equal(mapping.thinking, 'focus')
  assert.equal(mapping.patting, 'pat_soft')
  assert.equal(mapping.responding, 'talk')
  assert.equal(mapping.resting, 'sleep')
  for (const id of ['happy', 'shy', 'serious', 'confused', 'angry', 'frightened', 'exasperated', 'starry']) {
    assert.equal(mapping[id === 'happy' ? 'cheerful' : id], id)
  }
})

test('motion mapping suggestions safely omit unsupported slots and choose a valid idle action', () => {
  const mapping = suggestMotionBinding({
    defaultAction: 'missing',
    bindings: { focus: 'missing', patpat: 'missing' },
    actions: { stand: { id: 'stand' }, drag: { id: 'drag' } },
  })
  assert.equal(JSON.stringify(mapping), JSON.stringify({ idle: 'stand' }))
})

test('motion action options use readable labels, frame counts and durations', () => {
  assert.equal(
    describeMotionActionOption('fall_asleep', { frameCount: 5, durationMs: 500 }),
    '入睡（fall_asleep） · 5 帧 · 0.5 秒',
  )
  assert.equal(
    describeMotionActionOption('custom_pose', { frames: ['a', 'b'], durationMs: 1200 }),
    '动作（custom_pose） · 2 帧 · 1.2 秒',
  )
})

test('native motion resolver uses the idle action as a safe fallback', () => {
  assert.equal(resolveBoundMotionAction(binding, {}), 'idle')
  assert.equal(resolveBoundMotionAction({ ...binding, mapping: {} }, {}), 'idle')
  assert.equal(resolveBoundMotionAction({ ...binding, identityConfirmed: false }, {}), null)
})

test('native motion resolver maps thinking, response and patting interactions', () => {
  assert.equal(resolveBoundMotionAction(binding, { avatarMotion: 'thinking' }), 'think')
  assert.equal(resolveBoundMotionAction(binding, { avatarMotion: 'responding' }), 'talk')
  assert.equal(resolveBoundMotionAction(binding, { avatarMotion: 'patting' }), 'pat')
})

test('native motion resolver maps PPL expressions and resting fatigue', () => {
  assert.equal(resolveBoundMotionAction(binding, { expression: 'shy' }), 'shy')
  assert.equal(resolveBoundMotionAction(binding, { expression: 'angry' }), 'angry')
  assert.equal(resolveBoundMotionAction(binding, { fatigue: 0.9 }), 'rest')
  assert.equal(resolveBoundMotionAction(binding, { expression: 'confused' }), 'idle')
})

test('native motion resolver ignores mappings that are absent from the verified catalog', () => {
  const partial = { ...binding, mapping: { idle: 'idle', thinking: 'missing', patting: 'missing', cheerful: 'missing' } }
  assert.equal(resolveBoundMotionAction(partial, { avatarMotion: 'thinking' }), 'idle')
  assert.equal(resolveBoundMotionAction(partial, { avatarMotion: 'patting', expression: 'cheerful' }), 'idle')
})
