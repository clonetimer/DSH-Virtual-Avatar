import { createHash } from 'node:crypto'

const sha = value => createHash('sha256').update(value).digest('hex')

/**
 * Build an Agent-only persona section. Companion persona data is intentionally
 * rejected here so a Galgame character can never silently become the main Agent.
 */
export function assembleAgentPrompt({ persona, runtimeSnapshot, budget = 12000 } = {}) {
  if (!persona || persona.enabled === false) {
    return { text: '', source: null, personaId: null, personaVersion: null, snapshotHash: null, charCount: 0, truncated: false, warnings: [] }
  }
  if (persona.kind !== 'agent') {
    const error = new Error('only Agent personas may be injected into the main Agent prompt')
    error.code = 'PERSONA_SCOPE_VIOLATION'
    throw error
  }
  if (!Number.isInteger(budget) || budget < 0) throw new TypeError('budget must be a non-negative integer')
  const staticText = String(persona.content || '').trim()
  const dynamicText = String(runtimeSnapshot?.dynamicPrompt || '').trim()
  const parts = [staticText, dynamicText].filter(Boolean)
  const full = parts.join('\n\n')
  const text = full.slice(0, budget)
  return {
    text,
    source: 'dsh-virtual-avatar',
    personaId: persona.id,
    personaVersion: persona.version,
    snapshotHash: runtimeSnapshot ? sha(JSON.stringify(runtimeSnapshot)) : null,
    charCount: text.length,
    truncated: text.length < full.length,
    warnings: text.length < full.length ? ['PROMPT_BUDGET_EXCEEDED'] : [],
  }
}

/** Companion prompts are explicitly scoped to Galgame requests only. */
export function assembleCompanionPrompt({ character, persona, runtimeSnapshot } = {}) {
  if (!character || !persona) throw new TypeError('character and persona are required')
  if (persona.kind !== 'companion') throw new TypeError('companion persona required')
  if (character.personaId !== persona.id) throw new Error('character/persona binding mismatch')
  return {
    channel: 'galgame-only',
    characterId: character.id,
    personaId: persona.id,
    text: [persona.content, runtimeSnapshot?.dynamicPrompt].filter(Boolean).join('\n\n'),
  }
}
