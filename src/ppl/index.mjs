import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PersonaRuntime } from './lib/persona-runtime.js'
import { applyResolution } from './vendor/pplc/runtime.js'

const IR_PATH = fileURLToPath(new URL('../../personas/deepseek-whale.pir.json', import.meta.url))
const COMMIT_REASONS = new Set(['completed', 'max-tokens'])
let cachedPersona = null

export function loadDeepseekWhalePersona(raw = readFileSync(IR_PATH, 'utf8')) {
  let ir
  try { ir = JSON.parse(raw) } catch (cause) {
    const error = new Error('DeepSeek Whale PPL IR is not valid JSON', { cause })
    error.code = 'PPL_IR_INVALID_JSON'
    throw error
  }
  if (ir?.schema !== 'ppl.persona-ir/0.3' || ir?.persona?.id !== 'DEEPSEEK_WHALE') {
    const error = new Error('expected PPL 0.3 DEEPSEEK_WHALE Persona IR')
    error.code = 'PPL_IR_SCHEMA_MISMATCH'
    throw error
  }
  if (!ir.symbols || !Array.isArray(ir.rules) || !ir.runtimeInitial) {
    const error = new Error('DeepSeek Whale PPL IR is missing required runtime fields')
    error.code = 'PPL_IR_INCOMPLETE'
    throw error
  }
  return ir
}

export function getDeepseekWhalePersona() {
  if (!cachedPersona) cachedPersona = loadDeepseekWhalePersona()
  return cachedPersona
}

export function resetDeepseekWhalePersonaCache() {
  cachedPersona = null
}

export function createDeepseekWhaleRuntime({ scene, context, profile = 'standard' } = {}) {
  const ir = getDeepseekWhalePersona()
  const runtime = new PersonaRuntime({ persona: ir, scene, context, profile })
  return {
    ir,
    binding: runtime.personaBinding(),
    initialState(sessionId = 'deepseek-whale') {
      return {
        ...structuredClone(ir.runtimeInitial || {}),
        session: { id: sessionId, turn: 0 },
      }
    },
    staticPrompt(runtimeState) {
      return runtime.staticPrompt(runtimeState)
    },
    resolve(input) {
      return runtime.resolveHostStep({
        runtime: input.runtimeState,
        context: input.context || {},
        event: input.event || {},
        hostKind: 'dsh-virtual-avatar/deepseek-whale',
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
