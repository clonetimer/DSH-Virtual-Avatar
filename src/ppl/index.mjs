import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compile } from './vendor/pplc/compiler.js'
import { PersonaRuntime } from './lib/persona-runtime.js'
import { applyResolution } from './vendor/pplc/runtime.js'

const SOURCE_PATH = fileURLToPath(new URL('../../personas/deepseek-whale.ppl', import.meta.url))
const COMMIT_REASONS = new Set(['completed', 'max-tokens'])
let cachedCompiled = null

export function compileDeepseekWhalePersona(source = readFileSync(SOURCE_PATH, 'utf8')) {
  const result = compile(source, SOURCE_PATH)
  const errors = (result.diagnostics || []).filter(item => item.severity === 'error')
  if (!result.ir || errors.length) {
    const detail = errors.map(item => item.code + ': ' + item.message).join('; ')
    const error = new Error('DeepSeek Whale PPL compilation failed: ' + (detail || 'IR not produced'))
    error.code = 'PPL_COMPILE_FAILED'
    error.diagnostics = result.diagnostics || []
    throw error
  }
  return { ir: result.ir, diagnostics: result.diagnostics || [] }
}

export function getDeepseekWhalePersona() {
  if (!cachedCompiled) cachedCompiled = compileDeepseekWhalePersona()
  return cachedCompiled
}

export function resetDeepseekWhalePersonaCache() {
  cachedCompiled = null
}

export function createDeepseekWhaleRuntime({ scene, context, profile = 'standard' } = {}) {
  const { ir } = getDeepseekWhalePersona()
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
