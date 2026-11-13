import assert from 'node:assert/strict'
import test from 'node:test'
import { SqliteAvatarStore } from '../../src/storage/sqlite-store.mjs'
import { createMultiCharacterRegistry } from '../../src/ppl/multi-character-registry.mjs'
import { DeepseekWhaleService } from '../../src/characters/deepseek-whale/service.mjs'

test('P5-C2 runtime registry lists genuine distinct Persona IRs and restores the active selection', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const roles = createMultiCharacterRegistry({ store })
    assert.deepEqual(roles.list().map(x => x.personaId), ['DEEPSEEK_WHALE', 'ZHUANG_FANGYI'])
    assert.equal(roles.active().characterId, 'deepseek')
    assert.equal(roles.get('ppl-zhuang-fangyi').hasDedicatedArtwork, false)
    assert.equal(roles.getService('ppl-zhuang-fangyi').runtime.binding.id, 'ZHUANG_FANGYI')
    const selected = roles.select('ppl-zhuang-fangyi')
    assert.equal(selected.active.characterId, 'ppl-zhuang-fangyi')
    assert.equal(createMultiCharacterRegistry({ store }).active().characterId, 'ppl-zhuang-fangyi')
    assert.throws(
      () => roles.select('../deepseek'),
      error => error.code === 'CHARACTER_NOT_FOUND' && error.status === 404,
    )
    assert.equal(roles.active().characterId, 'ppl-zhuang-fangyi')
    assert.throws(() => roles.getService('deepseek'), error => error.code === 'CHARACTER_ROUTE_MISMATCH')
  } finally { store.close() }
})

test('P5-C2 isolated PPL role persists chat, relationship, memory and scene without touching the Whale', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const roles = createMultiCharacterRegistry({ store })
    const other = roles.getService('ppl-zhuang-fangyi')
    const whale = new DeepseekWhaleService({ store })
    const before = other.loadState()
    assert.equal(before.state.pplRuntime.relationships.admin.stage, 'trusted')
    assert.equal(before.state.conversation.chatLines.length, 0)
    assert.equal(whale.loadState().state.conversation.chatLines.length, 0)

    const prepared = other.prepareTurn({ text: '你辛苦了', eventId: 'zhuang-turn-1' })
    assert.equal(prepared.personaId, 'ZHUANG_FANGYI')
    assert.ok(prepared.system.includes('庄方宜'))
    assert.ok(!prepared.system.includes('只扮演 DeepSeek 鲸鱼娘'))
    assert.ok(prepared.pplResolution.activeRules.some(rule => rule.id === 'ADMIN_COMFORT_TRUST'))

    const committed = other.finalizeTurn(prepared, { reply: '谢谢，我会注意休息。' })
    assert.equal(committed.committed, true)
    assert.equal(other.loadState().state.conversation.chatLines.length, 2)
    assert.equal(other.loadState().state.pplRuntime.relationships.admin.trust, 0.87)
    assert.equal(whale.loadState().state.conversation.chatLines.length, 0)
    assert.equal(whale.loadState().state.pplRuntime.relationships.admin.trust, 0.5)

    const memory = other.remember('只属于庄方宜的记忆', { eventId: 'zhuang-memory-1' })
    assert.equal(memory.duplicate, false)
    assert.equal(other.listMemories().length, 1)
    assert.equal(whale.listMemories().length, 0)
    assert.equal(other.pinMemory(memory.memory.id, true).pinned, true)
    assert.equal(whale.pinMemory(memory.memory.id, true), null)

    const publicScene = other.setInteractionScene('PUBLIC_OFFICE')
    assert.equal(publicScene.scene, 'PUBLIC_OFFICE')
    assert.equal(other.loadState().state.interactionScene, 'PUBLIC_OFFICE')
    const reopened = createMultiCharacterRegistry({ store }).getService('ppl-zhuang-fangyi')
    assert.equal(reopened.loadState().state.conversation.chatLines.length, 2)
    assert.equal(reopened.listMemories().length, 1)
    assert.equal(reopened.loadState().state.interactionScene, 'PUBLIC_OFFICE')
    assert.equal(whale.loadState().state.interactionScene, 'PRIVATE_HOME')
    assert.equal(store.listAuditEvents('character', 'ppl-zhuang-fangyi').filter(x => x.type === 'TURN_COMPLETED').length, 1)
    assert.equal(store.listAuditEvents('character', 'deepseek').length, 0)
  } finally { store.close() }
})

test('P5-C2 per-role PPL settings preview and restore without changing another IR', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const registry = createMultiCharacterRegistry({ store })
    const other = registry.getService('ppl-zhuang-fangyi')
    const before = other.getConfiguration()
    const baselineHash = before.irSha256
    const preview = other.previewConfiguration({
      traits: { emotional_guard: 0.77 },
      style: { formality: 0.77, verbosity: 0.37 },
    })
    assert.equal(preview.valid, true)
    assert.equal(preview.scenarios.length, 4)
    assert.notEqual(preview.irSha256, baselineHash)
    assert.equal(store.loadCharacterState('ppl-zhuang-fangyi'), null)
    const saved = other.saveConfiguration({ style: { formality: 0.77 } }, { expectedRevision: 0 })
    assert.equal(saved.changed, true)
    assert.equal(other.getConfiguration().effective.style.formality, 0.77)
    const reloaded = createMultiCharacterRegistry({ store }).getService('ppl-zhuang-fangyi')
    assert.equal(reloaded.getConfiguration().effective.style.formality, 0.77)
    assert.notEqual(reloaded.getConfiguration().irSha256, baselineHash)
    assert.throws(
      () => reloaded.saveConfiguration({ style: { formality: 0.83 } }, { expectedRevision: 0 }),
      error => error.code === 'REVISION_CONFLICT',
    )
    assert.throws(
      () => reloaded.previewConfiguration({ style: { formality: 0.1 } }),
      error => error.code === 'PPL_ROLE_CONFIGURATION_RANGE',
    )
    assert.throws(
      () => reloaded.previewConfiguration({ rules: { PUBLIC_RESTRAINT: false } }),
      error => error.code === 'PPL_ROLE_CONFIGURATION_FIELD',
    )
    const reset = reloaded.saveConfiguration({}, { expectedRevision: saved.revision })
    assert.equal(reset.changed, true)
    assert.equal(reset.configuration.irSha256, baselineHash)
    assert.equal(new DeepseekWhaleService({ store }).getPplConfiguration().effective.traits.warmth, 0.78)
    const audit = store.listAuditEvents('character', 'ppl-zhuang-fangyi')
    assert.equal(audit.filter(x => x.type === 'PPL_CONFIGURATION_UPDATED').length, 2)
  } finally { store.close() }
})

test('P5-C2 identical event ids across roles are rejected even with identical payloads', () => {
  const store = new SqliteAvatarStore(':memory:')
  try {
    const registry = createMultiCharacterRegistry({ store })
    const other = registry.getService('ppl-zhuang-fangyi')
    const prepared = other.prepareTurn({ text: '你好', eventId: 'cross-character-event-1' })
    other.finalizeTurn(prepared, { reply: '你好。' })
    const saved = store.findDomainEvent('cross-character-event-1')
    assert.equal(saved.characterId, 'ppl-zhuang-fangyi')
    assert.throws(
      () => store.commitCharacterTurn({
        eventId: 'cross-character-event-1',
        characterId: 'deepseek',
        payload: saved.payload,
        state: { conversation: { log: [], chatLines: [], choices: [] } },
        expectedRevision: 0,
      }),
      error => error.code === 'EVENT_ID_CONFLICT',
    )
    assert.equal(store.loadCharacterState('deepseek'), null)
    assert.equal(store.loadCharacterState('ppl-zhuang-fangyi').state.conversation.chatLines.length, 2)
  } finally { store.close() }
})
