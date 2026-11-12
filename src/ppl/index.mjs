import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PersonaRuntime } from './lib/persona-runtime.js'
import { applyResolution } from './vendor/pplc/runtime.js'

const IR_PATH = fileURLToPath(new URL('../../personas/deepseek-whale.pir.json', import.meta.url))
const COMMIT_REASONS = new Set(['completed', 'max-tokens'])
let cachedPersona = null

export function validatePersonaIR(ir, expectedId) {
  if (ir?.schema !== 'ppl.persona-ir/0.3') {
    const error = new Error('expected PPL 0.3 Persona IR')
    error.code = 'PPL_IR_SCHEMA_MISMATCH'
    throw error
  }
  if (expectedId && ir?.persona?.id !== expectedId) {
    const error = new Error('Persona IR id does not match the requested persona id')
    error.code = 'PPL_IR_ID_MISMATCH'
    throw error
  }
  if (!ir?.persona?.id || !ir.symbols || !Array.isArray(ir.rules) || !ir.runtimeInitial) {
    const error = new Error('Persona IR is missing required runtime fields')
    error.code = 'PPL_IR_INCOMPLETE'
    throw error
  }
  return ir
}

export function loadDeepseekWhalePersona(raw = readFileSync(IR_PATH, 'utf8')) {
  let ir
  try { ir = JSON.parse(raw) } catch (cause) {
    const error = new Error('DeepSeek Whale PPL IR is not valid JSON', { cause })
    error.code = 'PPL_IR_INVALID_JSON'
    throw error
  }
  return validatePersonaIR(ir, 'DEEPSEEK_WHALE')
}

export function getDeepseekWhalePersona() {
  if (!cachedPersona) cachedPersona = loadDeepseekWhalePersona()
  return structuredClone(cachedPersona)
}

export function resetDeepseekWhalePersonaCache() {
  cachedPersona = null
}

/**
 * Create an isolated PPL Runtime adapter for any validated Persona IR.
 * Runtime state is always caller-owned; the adapter never mutates shared IR.
 */
export function createPplRuntime({
  persona,
  scene,
  context,
  profile = 'standard',
  hostKind = 'unknown',
} = {}) {
  validatePersonaIR(persona)
  const ir = structuredClone(persona)
  const runtime = new PersonaRuntime({ persona: ir, scene, context, profile })
  return {
    ir,
    binding: runtime.personaBinding(),
    initialState(sessionId = ir.persona.id.toLowerCase()) {
      return {
        ...structuredClone(ir.runtimeInitial || {}),
        session: { id: sessionId, turn: 0 },
      }
    },
    staticPrompt(runtimeState) {
      return runtime.staticPrompt(runtimeState)
    },
    resolve(input = {}) {
      return runtime.resolveHostStep({
        runtime: input.runtimeState,
        scene: input.scene ?? scene,
        context: input.context || {},
        event: input.event || {},
        hostKind: input.hostKind ?? hostKind,
        turn: input.turn ?? input.runtimeState?.session?.turn ?? 0,
        step: input.step ?? 1,
      })
    },
    finalize(runtimeState, resolution, terminalReason) {
      if (!COMMIT_REASONS.has(String(terminalReason))) {
        return { committed: false, runtimeState: structuredClone(runtimeState), reason: String(terminalReason || 'unknown') }
      }
      if (!resolution?.valid) {
        const error = new Error('cannot commit an invalid PPL resolution')
        error.code = 'PPL_RESOLUTION_INVALID'
        throw error
      }
      return {
        committed: true,
        runtimeState: applyResolution(runtimeState, resolution),
        reason: String(terminalReason),
      }
    },
  }
}

export function createDeepseekWhaleRuntime({ scene, context, profile = 'standard' } = {}) {
  return createPplRuntime({
    persona: getDeepseekWhalePersona(),
    scene,
    context,
    profile,
    hostKind: 'dsh-virtual-avatar/deepseek-whale',
  })
}
