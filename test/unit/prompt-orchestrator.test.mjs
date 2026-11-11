import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleAgentPrompt, assembleCompanionPrompt } from '../../src/persona/prompt-orchestrator.mjs'

test('Agent prompt includes only Agent persona and respects budget', () => {
  const persona = { id: 'agent', kind: 'agent', version: '1', content: 'static' }
  const result = assembleAgentPrompt({ persona, runtimeSnapshot: { dynamicPrompt: 'dynamic' }, budget: 9 })
  assert.equal(result.text, 'static\n\nd')
  assert.equal(result.truncated, true)
  assert.throws(() => assembleAgentPrompt({ persona: { ...persona, kind: 'companion' } }), { code: 'PERSONA_SCOPE_VIOLATION' })
})

test('disabled Agent persona adds no prompt; companion prompt is Galgame-only', () => {
  assert.equal(assembleAgentPrompt({ persona: { kind: 'agent', enabled: false } }).text, '')
  const companion = assembleCompanionPrompt({
    character: { id: 'whale', personaId: 'whale-persona' },
    persona: { id: 'whale-persona', kind: 'companion', content: 'Whale' },
  })
  assert.equal(companion.channel, 'galgame-only')
  assert.equal(companion.text, 'Whale')
  assert.throws(() => assembleCompanionPrompt({
    character: { id: 'whale', personaId: 'agent' },
    persona: { id: 'agent', kind: 'agent', content: 'Agent' },
  }))
})
