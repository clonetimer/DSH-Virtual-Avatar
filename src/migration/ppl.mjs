import { createHash } from 'node:crypto'
const sha = text => createHash('sha256').update(text).digest('hex')

export function inspectPplPersonaIr(raw) {
  let sourceRaw = typeof raw === 'string' ? raw : JSON.stringify(raw)
  if (typeof raw === 'string') {
    let parsed
    try { parsed = JSON.parse(raw) } catch (cause) {
      const error = new Error('PPL Persona IR is not valid JSON', { cause })
      error.code = 'INVALID_SOURCE_JSON'
      throw error
    }
    raw = parsed
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('PPL Persona IR root must be an object')
  if (raw.schema !== 'ppl.persona-ir/0.3') {
    const error = new Error('unsupported PPL Persona IR schema: ' + String(raw.schema))
    error.code = 'UNSUPPORTED_PPL_SCHEMA'
    throw error
  }
  const personaId = raw.persona?.id
  if (typeof personaId !== 'string' || !personaId) throw new TypeError('PPL Persona IR persona.id required')
  return {
    sourceKind: 'ppl-persona-ir',
    sourceHash: sha(JSON.stringify(raw)),
    schema: raw.schema,
    personaId,
    version: String(raw.persona?.version || 'unknown'),
    displayName: String(raw.meta?.display_name || raw.identity?.name || personaId),
    ruleCount: Array.isArray(raw.rules) ? raw.rules.length : 0,
    transitionCount: Array.isArray(raw.transitions) ? raw.transitions.length : 0,
    ir: structuredClone(raw),
    raw: sourceRaw,
  }
}
