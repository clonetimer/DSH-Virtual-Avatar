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

const binding = {
  identityConfirmed: true,
  mapping: { idle: 'idle', thinking: 'think', responding: 'talk', patting: 'pat', resting: 'rest', shy: 'shy', angry: 'angry' },
  catalog: {
    defaultAction: 'idle',
    actions: Object.fromEntries(['idle', 'think', 'talk', 'pat', 'rest', 'shy', 'angry'].map(id => [id, { id }])),
  },
}

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
