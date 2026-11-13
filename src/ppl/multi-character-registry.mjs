import { readFileSync } from 'node:fs'
import { createDefaultPersonaRegistry } from './registry.mjs'
import { PplCompanionService } from '../characters/ppl-companion/service.mjs'

const ZHUANG_IR_URL = new URL('../../personas/reference/zhuang-fangyi.pir.json', import.meta.url)
const REFERENCE_IR = JSON.parse(readFileSync(ZHUANG_IR_URL, 'utf8'))

const ROLES = Object.freeze([
  Object.freeze({
    characterId: 'deepseek',
    personaId: 'DEEPSEEK_WHALE',
    kind: 'whale',
    label: '鲸鱼娘',
    description: '原生桌宠与独立陪伴对话',
    hasDedicatedArtwork: true,
  }),
  Object.freeze({
    characterId: 'ppl-zhuang-fangyi',
    personaId: 'ZHUANG_FANGYI',
    kind: 'ppl-reference',
    label: '庄方宜 · PPL 参考角色',
    description: '独立 PPL 人格、关系、聊天、记忆与配置；使用中性角色标识',
    hasDedicatedArtwork: false,
  }),
])

function roleError(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export class MultiCharacterRegistry {
  #store
  #personas
  #roles = new Map()
  #services = new Map()

  constructor({ store, personaRegistry = null } = {}) {
    if (!store?.getActiveCompanionId || !store?.setActiveCompanionId) {
      throw new TypeError('multi-character registry requires a companion selection store')
    }
    this.#store = store
    this.#personas = personaRegistry || createDefaultPersonaRegistry()
    if (!this.#personas.has('ZHUANG_FANGYI')) {
      this.#personas.register({
        id: 'ZHUANG_FANGYI',
        ir: REFERENCE_IR,
        profile: 'standard',
        hostKind: 'dsh-virtual-avatar/ppl-zhuang-fangyi',
      })
    }
    for (const role of ROLES) {
      if (!this.#personas.has(role.personaId)) {
        throw roleError('PPL_ROLE_PERSONA_MISSING', 'registered PPL persona not found: ' + role.personaId)
      }
      this.#roles.set(role.characterId, role)
      if (role.kind !== 'whale') {
        this.#services.set(role.characterId, new PplCompanionService({
          store,
          characterId: role.characterId,
          personaId: role.personaId,
          displayName: role.label,
          runtime: this.#personas.createRuntime(role.personaId),
        }))
      }
    }
  }

  get(characterId) {
    const role = this.#roles.get(String(characterId || ''))
    return role ? { ...role, binding: this.#personas.get(role.personaId).binding } : null
  }

  list() {
    return ROLES.map(role => this.get(role.characterId))
  }

  resolve(characterId, { requireGeneric = false } = {}) {
    const id = String(characterId || '')
    const role = this.get(id)
    if (!role) throw roleError('CHARACTER_NOT_FOUND', '未找到该角色，请刷新角色列表。', 404)
    if (requireGeneric && role.kind === 'whale') {
      throw roleError('CHARACTER_ROUTE_MISMATCH', '鲸鱼娘使用原有完整陪伴接口。', 400)
    }
    return role
  }

  getService(characterId) {
    this.resolve(characterId, { requireGeneric: true })
    return this.#services.get(characterId)
  }

  active() {
    const id = this.#store.getActiveCompanionId()
    return this.get(id) || this.get('deepseek')
  }

  select(characterId) {
    const role = this.resolve(characterId)
    this.#store.setActiveCompanionId(role.characterId)
    return { active: role, roles: this.list() }
  }
}

export function createMultiCharacterRegistry(options) {
  return new MultiCharacterRegistry(options)
}
