import assert from 'node:assert/strict'
import test from 'node:test'
import { getDeepseekWhalePersona } from '../../src/ppl/index.mjs'
import {
  applyPplConfiguration,
  getPplConfigurationDefaults,
  normalizePplConfiguration,
  resolvePplConfiguration,
} from '../../src/ppl/configuration.mjs'

test('PPL visual configuration exposes only curated trait and style values', () => {
  const ir = getDeepseekWhalePersona()
  const defaults = getPplConfigurationDefaults(ir)
  assert.deepEqual(defaults.traits, {
    warmth: 0.78,
    playfulness: 0.74,
    assertiveness: 0.32,
    emotional_guard: 0.25,
    vulnerability: 0.62,
  })
  assert.deepEqual(defaults.style, {
    formality: 0.15,
    verbosity: 0.38,
    emotional_explicitness: 0.75,
    action_description: 0.2,
  })
})

test('PPL visual configuration normalizes sliders and omits values equal to the base', () => {
  const ir = getDeepseekWhalePersona()
  const normalized = normalizePplConfiguration({
    traits: { warmth: 0.9, playfulness: 0.741 },
    style: { verbosity: 0.38, emotional_explicitness: 0.83 },
  }, ir)
  assert.deepEqual(normalized, {
    schema: 'dsh-virtual-avatar.ppl-config/1',
    traits: { warmth: 0.9, playfulness: 0.74 },
    style: { emotional_explicitness: 0.83 },
  })
  const resolved = resolvePplConfiguration(ir, normalized)
  assert.equal(resolved.effective.traits.warmth, 0.9)
  assert.equal(resolved.effective.traits.playfulness, 0.74)
  assert.equal(resolved.effective.style.verbosity, 0.38)
})

test('PPL visual configuration protects CORE_TONE minimum warmth', () => {
  const ir = getDeepseekWhalePersona()
  assert.throws(
    () => normalizePplConfiguration({ traits: { warmth: 0.59 } }, ir),
    error => error.code === 'PPL_CONFIGURATION_VALUE_OUT_OF_RANGE' && error.status === 400,
  )
})

test('PPL visual configuration rejects unknown sections, fields and non-finite values', () => {
  const ir = getDeepseekWhalePersona()
  assert.throws(
    () => normalizePplConfiguration({ rules: { MASTER_COMFORT_TRUST: false } }, ir),
    error => error.code === 'PPL_CONFIGURATION_FIELD_UNSUPPORTED',
  )
  assert.throws(
    () => normalizePplConfiguration({ traits: { trust: 0.8 } }, ir),
    error => error.code === 'PPL_CONFIGURATION_FIELD_UNSUPPORTED',
  )
  assert.throws(
    () => normalizePplConfiguration({ style: { verbosity: Number.NaN } }, ir),
    error => error.code === 'PPL_CONFIGURATION_VALUE_INVALID',
  )
  assert.throws(
    () => normalizePplConfiguration({ schema: 'other/9' }, ir),
    error => error.code === 'PPL_CONFIGURATION_SCHEMA_UNSUPPORTED',
  )
})

test('applying PPL visual configuration clones the Persona IR without mutating the baseline', () => {
  const ir = getDeepseekWhalePersona()
  const originalHash = JSON.stringify(ir.base)
  const applied = applyPplConfiguration(ir, {
    traits: { warmth: 0.92, playfulness: 0.86 },
    style: { formality: 0.08, verbosity: 0.52 },
  })
  assert.equal(applied.persona.base.traits.warmth, 0.92)
  assert.equal(applied.persona.base.traits.playfulness, 0.86)
  assert.equal(applied.persona.base.style.formality, 0.08)
  assert.equal(applied.persona.rules.length, ir.rules.length)
  assert.equal(JSON.stringify(ir.base), originalHash)
  assert.notEqual(applied.persona, ir)
})
