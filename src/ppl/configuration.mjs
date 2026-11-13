export const PPL_CONFIGURATION_SCHEMA = 'dsh-virtual-avatar.ppl-config/1'

export const PPL_CONFIGURATION_FIELDS = Object.freeze([
  Object.freeze({
    group: 'traits', key: 'warmth', label: '温柔度', min: 0.6, max: 1, step: 0.01,
    description: '影响关怀、耐心和情绪支持的基础倾向。最低值受人格核心约束保护。',
  }),
  Object.freeze({
    group: 'traits', key: 'playfulness', label: '活泼度', min: 0, max: 1, step: 0.01,
    description: '影响俏皮、轻松和主动调侃的程度。',
  }),
  Object.freeze({
    group: 'traits', key: 'assertiveness', label: '主动表达', min: 0, max: 1, step: 0.01,
    description: '影响主动表达意见、提出建议和表达立场的程度。',
  }),
  Object.freeze({
    group: 'traits', key: 'emotional_guard', label: '情绪克制', min: 0, max: 1, step: 0.01,
    description: '数值越高越谨慎内敛；越低越容易自然表达情绪。',
  }),
  Object.freeze({
    group: 'traits', key: 'vulnerability', label: '坦诚程度', min: 0, max: 1, step: 0.01,
    description: '影响表达疲惫、害羞和自身感受的开放程度。',
  }),
  Object.freeze({
    group: 'style', key: 'formality', label: '正式程度', min: 0, max: 1, step: 0.01,
    description: '数值越高，措辞越礼貌、正式和克制。',
  }),
  Object.freeze({
    group: 'style', key: 'verbosity', label: '表达详略', min: 0, max: 1, step: 0.01,
    description: '数值越高，回答越充分；数值越低，表达越简洁。',
  }),
  Object.freeze({
    group: 'style', key: 'emotional_explicitness', label: '情绪表达', min: 0, max: 1, step: 0.01,
    description: '影响关心、开心、害羞等情绪表达的直接程度。',
  }),
  Object.freeze({
    group: 'style', key: 'action_description', label: '动作描写', min: 0, max: 1, step: 0.01,
    description: '影响回复中简短动作和表情描写的使用程度。',
  }),
])

const FIELD_MAP = new Map(PPL_CONFIGURATION_FIELDS.map(field => [field.group + '.' + field.key, field]))
const ALLOWED_GROUPS = new Set(['traits', 'style'])

function configurationError(code, message) {
  const error = new TypeError(message)
  error.code = code
  error.status = 400
  return error
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readBaseValue(ir, group, key) {
  const value = ir?.base?.[group]?.[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw configurationError('PPL_CONFIGURATION_BASE_INVALID', 'PPL base value is missing or invalid: ' + group + '.' + key)
  }
  return value
}

export function getPplConfigurationDefaults(ir) {
  const defaults = { traits: {}, style: {} }
  for (const field of PPL_CONFIGURATION_FIELDS) {
    defaults[field.group][field.key] = readBaseValue(ir, field.group, field.key)
  }
  return defaults
}

export function normalizePplConfiguration(raw = {}, ir) {
  if (!isRecord(raw)) {
    throw configurationError('PPL_CONFIGURATION_INVALID', 'PPL configuration must be an object')
  }
  if (raw.schema !== undefined && raw.schema !== PPL_CONFIGURATION_SCHEMA) {
    throw configurationError('PPL_CONFIGURATION_SCHEMA_UNSUPPORTED', 'unsupported PPL configuration schema')
  }
  for (const key of Object.keys(raw)) {
    if (!['schema', 'traits', 'style'].includes(key)) {
      throw configurationError('PPL_CONFIGURATION_FIELD_UNSUPPORTED', 'unsupported PPL configuration section: ' + key)
    }
  }

  const defaults = getPplConfigurationDefaults(ir)
  const normalized = { schema: PPL_CONFIGURATION_SCHEMA, traits: {}, style: {} }
  for (const group of ALLOWED_GROUPS) {
    const values = raw[group] ?? {}
    if (!isRecord(values)) {
      throw configurationError('PPL_CONFIGURATION_GROUP_INVALID', 'PPL configuration section must be an object: ' + group)
    }
    for (const key of Object.keys(values)) {
      if (!FIELD_MAP.has(group + '.' + key)) {
        throw configurationError('PPL_CONFIGURATION_FIELD_UNSUPPORTED', 'unsupported PPL configuration field: ' + group + '.' + key)
      }
    }
    for (const [key, value] of Object.entries(values)) {
      const field = FIELD_MAP.get(group + '.' + key)
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw configurationError('PPL_CONFIGURATION_VALUE_INVALID', 'PPL configuration value must be a finite number: ' + group + '.' + key)
      }
      if (value < field.min || value > field.max) {
        throw configurationError(
          'PPL_CONFIGURATION_VALUE_OUT_OF_RANGE',
          field.label + ' must be between ' + field.min.toFixed(2) + ' and ' + field.max.toFixed(2),
        )
      }
      const rounded = Math.round(value * 100) / 100
      if (Math.abs(rounded - defaults[group][key]) >= 0.000001) normalized[group][key] = rounded
    }
  }
  return normalized
}

export function resolvePplConfiguration(ir, raw = {}) {
  const defaults = getPplConfigurationDefaults(ir)
  const overrides = normalizePplConfiguration(raw, ir)
  const effective = {
    traits: { ...defaults.traits, ...overrides.traits },
    style: { ...defaults.style, ...overrides.style },
  }
  return { schema: PPL_CONFIGURATION_SCHEMA, defaults, overrides, effective }
}

export function applyPplConfiguration(ir, raw = {}) {
  if (!isRecord(ir) || ir.schema !== 'ppl.persona-ir/0.3' || !isRecord(ir.base)) {
    throw configurationError('PPL_CONFIGURATION_IR_INVALID', 'a valid PPL 0.3 Persona IR is required')
  }
  const resolved = resolvePplConfiguration(ir, raw)
  const persona = structuredClone(ir)
  persona.base.traits = { ...persona.base.traits, ...resolved.effective.traits }
  persona.base.style = { ...persona.base.style, ...resolved.effective.style }
  return { persona, ...resolved }
}
