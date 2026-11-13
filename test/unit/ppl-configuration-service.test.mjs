import assert from 'node:assert/strict'
import test from 'node:test'
import { DeepseekWhaleService } from '../../src/characters/deepseek-whale/service.mjs'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'

test('PPL visual configuration previews scenarios without mutating saved state', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    const preview = service.previewPplConfiguration({
      traits: { warmth: 0.92, playfulness: 0.86 },
      style: { formality: 0.08, verbosity: 0.52 },
    })
    assert.equal(preview.valid, true)
    assert.equal(preview.effective.traits.warmth, 0.92)
    assert.equal(preview.scenarios.length, 4)
    assert.ok(preview.scenarios.find(item => item.id === 'comfort').activeRules.includes('MASTER_COMFORT_TRUST'))
    assert.ok(preview.scenarios.find(item => item.id === 'public-space').activeRules.includes('PUBLIC_RESTRAINT'))
    assert.equal(store.loadCharacterState('deepseek'), null)
  } finally {
    store.close()
  }
})

test('PPL visual configuration is saved, applied to runtime, audited and restored after service restart', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    const initial = service.getPplConfiguration()
    const saved = service.updatePplConfiguration({
      traits: { warmth: 0.92, playfulness: 0.86, assertiveness: 0.4 },
      style: { formality: 0.08, verbosity: 0.52, emotional_explicitness: 0.88 },
    }, { expectedRevision: initial.revision })
    assert.equal(saved.changed, true)
    assert.equal(saved.configuration.effective.traits.warmth, 0.92)
    assert.equal(saved.configuration.effective.traits.playfulness, 0.86)
    assert.notEqual(saved.configuration.irSha256, initial.irSha256)

    const prepared = service.prepareTurn({
      text: '你好呀',
      eventId: 'ppl-config-runtime-turn',
      sessionId: 'ppl-config-runtime-session',
    })
    assert.equal(prepared.pplSnapshot.persona.irSha256, saved.configuration.irSha256)
    assert.equal(prepared.pplResolution.resolved.traits.warmth, 0.92)
    assert.equal(prepared.pplResolution.resolved.traits.playfulness, 0.86)

    const restarted = new DeepseekWhaleService({ store })
    const restored = restarted.getPplConfiguration()
    assert.equal(restored.effective.traits.warmth, 0.92)
    assert.equal(restored.effective.traits.playfulness, 0.86)
    assert.equal(restored.irSha256, saved.configuration.irSha256)

    const audit = store.listAuditEvents('character', 'deepseek', { limit: 10 })
      .find(event => event.type === 'PPL_CONFIGURATION_UPDATED')
    assert.ok(audit)
    assert.equal(audit.details.schema, 'dsh-virtual-avatar.ppl-config/1')
    assert.ok(audit.details.changes.some(change => change.key === 'warmth' && change.after === 0.92))

    const reset = restarted.resetPplConfiguration({ expectedRevision: restored.revision })
    assert.equal(reset.changed, true)
    assert.equal(reset.configuration.effective.traits.warmth, 0.78)
    assert.equal(reset.configuration.effective.style.verbosity, 0.38)
  } finally {
    store.close()
  }
})

test('PPL visual configuration uses optimistic revision checks and rejects invariant-breaking values', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    const initial = service.getPplConfiguration()
    service.updateProfile({ displayName: '小鲸鱼' }, { expectedRevision: initial.revision })
    assert.throws(
      () => service.updatePplConfiguration({ traits: { warmth: 0.9 } }, { expectedRevision: initial.revision }),
      error => error.code === 'REVISION_CONFLICT',
    )
    assert.throws(
      () => service.updatePplConfiguration({ traits: { warmth: 0.59 } }),
      error => error.code === 'PPL_CONFIGURATION_VALUE_OUT_OF_RANGE',
    )
    assert.equal(service.getPplConfiguration().effective.traits.warmth, 0.78)
  } finally {
    store.close()
  }
})

test('saving unchanged default PPL configuration is a no-op', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const service = new DeepseekWhaleService({ store })
    const initial = service.getPplConfiguration()
    const result = service.updatePplConfiguration(initial.effective, { expectedRevision: initial.revision })
    assert.equal(result.changed, false)
    assert.equal(result.revision, 0)
    assert.equal(store.loadCharacterState('deepseek'), null)
  } finally {
    store.close()
  }
})

test('invalid persisted PPL configuration falls back safely and can be reset', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    store.saveCharacterState('deepseek', {
      pplConfigOverrides: { schema: 'dsh-virtual-avatar.ppl-config/1', traits: { warmth: 0.2 } },
    }, 0)
    const service = new DeepseekWhaleService({ store })
    const recovered = service.getPplConfiguration()
    assert.equal(recovered.configurationError.code, 'PPL_CONFIGURATION_VALUE_OUT_OF_RANGE')
    assert.equal(recovered.effective.traits.warmth, 0.78)
    const reset = service.resetPplConfiguration({ expectedRevision: recovered.revision })
    assert.equal(reset.changed, true)
    assert.equal(reset.configuration.configurationError, null)
    assert.equal(reset.configuration.effective.traits.warmth, 0.78)
  } finally {
    store.close()
  }
})
