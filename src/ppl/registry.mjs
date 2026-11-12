import { createPplRuntime, getDeepseekWhalePersona, validatePersonaIR } from './index.mjs'

const PERSONA_ID = /^[A-Z][A-Z0-9_]{1,63}$/u

function invalid(code, message) {
  const error = new TypeError(message)
  error.code = code
  return error
}

/**
 * Registry of immutable PPL Persona IR definitions.
 * Each createRuntime() call receives its own runtime adapter and initial state.
 * Conversation/relationship state remains owned by the character's storage service.
 */
export class PersonaRuntimeRegistry {
  #personas = new Map()

  register({ id, ir, profile = 'standard', hostKind } = {}) {
    const personaIR = ir
    const personaId = String(id || personaIR?.persona?.id || '').trim()
    if (!PERSONA_ID.test(personaId)) {
      throw invalid('PPL_PERSONA_ID_INVALID', 'persona id must be an uppercase stable identifier')
    }
    validatePersonaIR(personaIR, personaId)
    if (this.#personas.has(personaId)) {
      throw invalid('PPL_PERSONA_ALREADY_REGISTERED', 'persona is already registered: ' + personaId)
    }
    if (typeof profile !== 'string' || !profile.trim()) {
      throw invalid('PPL_PERSONA_PROFILE_INVALID', 'persona profile must be a non-empty string')
    }

    const storedIR = structuredClone(personaIR)
    const definition = {
      id: personaId,
      version: String(storedIR.persona.version || '0.0.0'),
      ir: storedIR,
      profile: profile.trim(),
      hostKind: String(hostKind || 'dsh-virtual-avatar/' + personaId.toLowerCase().replaceAll('_', '-')),
    }
    this.#personas.set(personaId, definition)
    return this.get(personaId)
  }

  has(id) {
    return this.#personas.has(String(id || ''))
  }

  get(id) {
    const definition = this.#personas.get(String(id || ''))
    if (!definition) return null
    const runtime = createPplRuntime({
      persona: definition.ir,
      profile: definition.profile,
      hostKind: definition.hostKind,
    })
    return {
      id: definition.id,
      version: definition.version,
      profile: definition.profile,
      hostKind: definition.hostKind,
      binding: runtime.binding,
    }
  }

  list() {
    return [...this.#personas.keys()].sort().map(id => this.get(id))
  }

  createRuntime(id, options = {}) {
    const definition = this.#personas.get(String(id || ''))
    if (!definition) {
      const error = new Error('PPL persona is not registered: ' + String(id || ''))
      error.code = 'PPL_PERSONA_NOT_FOUND'
      throw error
    }
    return createPplRuntime({
      persona: definition.ir,
      scene: options.scene,
      context: options.context,
      profile: options.profile ?? definition.profile,
      hostKind: options.hostKind ?? definition.hostKind,
    })
  }

  unregister(id) {
    return this.#personas.delete(String(id || ''))
  }
}

export function createDefaultPersonaRegistry() {
  const registry = new PersonaRuntimeRegistry()
  registry.register({
    id: 'DEEPSEEK_WHALE',
    ir: getDeepseekWhalePersona(),
    profile: 'standard',
    hostKind: 'dsh-virtual-avatar/deepseek-whale',
  })
  return registry
}
