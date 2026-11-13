import { createHash, randomUUID } from 'node:crypto'
import { MemoryService } from '../../memory/service.mjs'
import { createPplRuntime } from '../../ppl/index.mjs'
import { buildConversationContext } from '../deepseek-whale/context-window.mjs'

export const ROLE_CONFIGURATION_SCHEMA = 'dsh-virtual-avatar.role-config/1'
const COMMIT_REASONS = new Set(['completed', 'max-tokens'])

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, stable(value[key])]))
  }
  return value
}
const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const deepClone = value => structuredClone(value)
const invalid = (code, message, status = 400) => Object.assign(new Error(message), { code, status })

function configFields(ir) {
  const result = []
  for (const group of ['traits', 'style']) {
    for (const [key, base] of Object.entries(ir.base?.[group] || {})) {
      if (!Number.isFinite(base) || ir.semanticBindings?.[group + '.' + key]?.primitive !== 'Float01') continue
      const min = ir.persona?.id === 'ZHUANG_FANGYI' && group === 'style' && key === 'formality' ? 0.65 : 0
      result.push({ group, key, path: group + '.' + key, min, max: 1, step: 0.01, defaultValue: base })
    }
  }
  return result
}

export class PplCompanionService {
  constructor({ store, characterId, personaId, displayName, runtime } = {}) {
    if (!store || !runtime?.ir || typeof runtime.resolve !== 'function') throw new TypeError('generic PPL companion requires a store and compiled Persona IR runtime')
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(String(characterId || '')) || characterId === 'deepseek') {
      throw invalid('CHARACTER_ID_INVALID', 'invalid generic companion identifier')
    }
    if (runtime.binding.id !== personaId) throw invalid('PPL_PERSONA_ID_MISMATCH', 'runtime persona id mismatch')
    this.store = store
    this.characterId = characterId
    this.personaId = personaId
    this.displayName = String(displayName || runtime.ir.meta?.display_name || runtime.ir.identity?.name || personaId)
    this.baseIr = deepClone(runtime.ir)
    this.memory = new MemoryService({ store })
    this.scenes = Object.keys(this.baseIr.scenes || {})
    this.defaultScene = this.scenes.find(scene => /PRIVATE/i.test(scene)) || this.scenes[0] || null
    this.publicScene = this.scenes.find(scene => /PUBLIC/i.test(scene)) || this.scenes.at(-1) || this.defaultScene
    this.configFields = configFields(this.baseIr)
    this.runtime = runtime
    this.runtimeHash = null
    this.configurationError = null
  }

  #normalizeConfiguration(raw = {}) {
    if (!isRecord(raw)) throw invalid('PPL_ROLE_CONFIGURATION_INVALID', '角色人格参数必须是对象')
    if (raw.schema !== undefined && raw.schema !== ROLE_CONFIGURATION_SCHEMA) throw invalid('PPL_ROLE_CONFIGURATION_SCHEMA', '角色人格配置版本不兼容')
    for (const group of Object.keys(raw)) if (!['schema', 'traits', 'style'].includes(group)) throw invalid('PPL_ROLE_CONFIGURATION_FIELD', '不支持的人格配置分组：' + group)
    const overrides = { schema: ROLE_CONFIGURATION_SCHEMA, traits: {}, style: {} }
    for (const group of ['traits', 'style']) {
      const values = raw[group] ?? {}
      if (!isRecord(values)) throw invalid('PPL_ROLE_CONFIGURATION_FIELD', '人格配置分组必须为对象')
      for (const [key, value] of Object.entries(values)) {
        const field = this.configFields.find(item => item.group === group && item.key === key)
        if (!field) throw invalid('PPL_ROLE_CONFIGURATION_FIELD', '不支持的人格字段：' + group + '.' + key)
        if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) {
          throw invalid('PPL_ROLE_CONFIGURATION_RANGE', field.path + ' 必须介于 ' + field.min + ' 与 ' + field.max)
        }
        const normalized = Math.round(value * 100) / 100
        if (normalized !== field.defaultValue) overrides[group][key] = normalized
      }
    }
    return overrides
  }

  #effective(overrides = {}) {
    const resolved = { traits: {}, style: {} }
    for (const field of this.configFields) {
      resolved[field.group][field.key] = overrides[field.group]?.[field.key] ?? field.defaultValue
    }
    return resolved
  }

  #candidate(overrides) {
    const ir = deepClone(this.baseIr)
    for (const group of ['traits', 'style']) Object.assign(ir.base[group], overrides[group] || {})
    return createPplRuntime({ persona: ir, hostKind: 'dsh-virtual-avatar/' + this.characterId })
  }

  #syncConfiguration(raw = {}) {
    const normalized = this.#normalizeConfiguration(raw)
    const hash = digest(normalized)
    if (hash !== this.runtimeHash) {
      this.runtime = this.#candidate(normalized)
      this.runtimeHash = hash
    }
    return normalized
  }

  #initialState(sessionId) {
    return {
      schema: 'dsh-virtual-avatar.character/2',
      pplRuntime: this.runtime.initialState(sessionId),
      interactionScene: this.defaultScene,
      pplConfigOverrides: { schema: ROLE_CONFIGURATION_SCHEMA, traits: {}, style: {} },
      conversation: { log: [], chatLines: [], choices: [] },
    }
  }

  loadState({ sessionId = this.characterId + '-default' } = {}) {
    const saved = this.store.loadCharacterState(this.characterId)
    let overrides
    try {
      overrides = this.#syncConfiguration(saved?.state?.pplConfigOverrides || {})
      this.configurationError = null
    } catch (error) {
      overrides = this.#syncConfiguration({})
      this.configurationError = { code: error.code || 'PPL_ROLE_CONFIGURATION_INVALID', message: String(error.message).slice(0, 180) }
    }
    if (!saved) return { state: this.#initialState(sessionId), revision: 0, persisted: false }
    const initial = this.#initialState(sessionId)
    const state = deepClone(saved.state)
    state.pplRuntime = {
      ...initial.pplRuntime,
      ...(isRecord(state.pplRuntime) ? state.pplRuntime : {}),
    }
    state.pplConfigOverrides = overrides
    if (!state.conversation || !Array.isArray(state.conversation.chatLines) || !Array.isArray(state.conversation.log)) state.conversation = initial.conversation
    if (!this.scenes.includes(state.interactionScene)) state.interactionScene = this.defaultScene
    return { state, revision: saved.revision, persisted: true }
  }

  setInteractionScene(scene, expectedRevision) {
    if (!this.scenes.includes(scene)) throw invalid('PPL_SCENE_UNKNOWN', '角色不支持该互动场景')
    const loaded = this.loadState()
    if (expectedRevision !== undefined && expectedRevision !== loaded.revision) throw invalid('REVISION_CONFLICT', '角色状态已更新，请刷新', 409)
    if (loaded.state.interactionScene === scene) return { scene, revision: loaded.revision, changed: false }
    const saved = this.store.saveCharacterState(this.characterId, { ...loaded.state, interactionScene: scene }, loaded.revision)
    return { scene, revision: saved.revision, changed: true }
  }

  #classify(text, eventId) {
    const kind = /安慰|辛苦|别难过|加油|休息|抱抱/u.test(text) ? 'COMFORT' : /表扬|做得好|太棒|你真棒|厉害/u.test(text) ? 'PRAISE' : 'MESSAGE'
    return { type: kind, actor: 'admin', subject: 'character', classification: { method: 'deterministic-companion', label: kind }, eventId }
  }

  prepareTurn({ text, eventId, sessionId = this.characterId + '-default', turn, step = 1 } = {}) {
    const input = String(text || '').trim().slice(0, 500)
    if (!input) throw invalid('MESSAGE_REQUIRED', '请输入消息内容')
    if (!eventId || typeof eventId !== 'string' || eventId.length > 200) throw invalid('EVENT_ID_INVALID', '请求编号无效')
    const loaded = this.loadState({ sessionId })
    const runtime = this.runtime
    const event = this.#classify(input, eventId)
    let resolved
    try {
      resolved = runtime.resolve({
        runtimeState: loaded.state.pplRuntime,
        scene: loaded.state.interactionScene,
        event,
        context: {},
        turn: turn ?? loaded.state.pplRuntime?.session?.turn ?? 0,
        step,
      })
    } catch (error) {
      this.store.recordPplResolutionFailure?.({
        eventId, characterId: this.characterId, persona: runtime.binding, event,
        scene: loaded.state.interactionScene, error,
      })
      throw error
    }
    const memoryContext = this.memory.retrieveContext({ ownerKind: 'character', ownerId: this.characterId, query: input, limit: 20, maxChars: 12000 })
    const identity = this.baseIr.identity || {}
    const system = [
      '你在 DSH 虚拟角色插件中扮演「' + this.displayName + '」，这是独立陪伴聊天，不是主 Agent，也不执行工作工具。',
      '角色身份：' + Object.entries(identity).map(([key, value]) => key + '=' + String(value)).join('；'),
      '保持与以下 PPL 0.3 Persona 约束一致，不应把你扮演成其他角色。',
      resolved.staticPrompt,
      resolved.dynamicPrompt,
      memoryContext.items.length ? '【此角色独有的长期记忆】\n' + memoryContext.items.map(item => '- ' + item.text).join('\n') : '',
    ].filter(Boolean).join('\n\n')
    const contextWindow = buildConversationContext({ history: loaded.state.conversation.log, memories: memoryContext.items, maxChars: 14000, recentMessages: 12 })
    return {
      characterId: this.characterId, personaId: this.personaId,
      eventId, input, event, runtime, expectedRevision: loaded.revision, baseState: loaded.state,
      scene: loaded.state.interactionScene, system, contextMessages: contextWindow.messages,
      pplResolution: resolved.resolution, pplSnapshot: resolved.snapshot,
    }
  }

  finalizeTurn(prepared, { reply, terminalReason = 'completed', provider = null, model = null, occurredAt = new Date().toISOString() } = {}) {
    if (prepared?.characterId !== this.characterId) throw invalid('CHARACTER_TURN_MISMATCH', '角色请求不匹配')
    if (!COMMIT_REASONS.has(terminalReason)) return { committed: false, reason: terminalReason, state: prepared.baseState }
    const response = String(reply || '').trim()
    if (!response) throw invalid('EMPTY_REPLY', '模型未返回有效回复')
    const final = prepared.runtime.finalize(prepared.baseState.pplRuntime, prepared.pplResolution, terminalReason)
    if (!final.committed) throw invalid('PPL_COMMIT_REFUSED', 'PPL 运行时拒绝提交')
    const next = deepClone(prepared.baseState)
    next.pplRuntime = final.runtimeState
    next.conversation.log.push(
      { role: 'user', text: prepared.input },
      {
        role: 'assistant', text: response,
        ...(typeof provider === 'string' && provider ? { provider } : {}),
        ...(typeof model === 'string' && model ? { model } : {}),
      },
    )
    next.conversation.chatLines.push(
      { who: 'user', text: prepared.input, at: Date.now() },
      { who: 'heroine', text: response, emotion: 'normal', at: Date.now() },
    )
    const resolution = prepared.pplResolution
    const changes = []
    const walk = (before, after, path) => {
      if (isRecord(before) || isRecord(after)) {
        for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) walk(before?.[key], after?.[key], path ? path + '.' + key : key)
      } else if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({ path, before: before ?? null, after: after ?? null })
      }
    }
    walk(prepared.baseState.pplRuntime, final.runtimeState, '')
    const audit = {
      schema: 'ppl.execution-audit/0.1', status: 'committed', persona: prepared.runtime.binding,
      event: { type: prepared.event.type, actor: prepared.event.actor }, scene: prepared.scene,
      snapshotSha256: digest(prepared.pplSnapshot),
      resolution: {
        valid: resolution.valid, activeRules: resolution.activeRules, activeTransitions: resolution.activeTransitions,
        effectTrace: resolution.trace, pendingCommits: resolution.pendingCommits,
        pendingTransitions: resolution.pendingTransitions, invariants: resolution.invariantResults,
        diagnostics: resolution.diagnostics,
      },
      state: { beforeSha256: digest(prepared.baseState.pplRuntime), afterSha256: digest(final.runtimeState), changes },
    }
    const committed = this.store.commitCharacterTurn({
      eventId: prepared.eventId, characterId: this.characterId,
      payload: {
        input: prepared.input, choiceId: null, reply: response, terminalReason,
        llmProvider: provider, llmModel: model,
        pplEventType: prepared.event.type, pplAudit: audit,
        pplSnapshotHash: audit.snapshotSha256, pplIrSha256: prepared.runtime.binding.irSha256,
      },
      state: next, expectedRevision: prepared.expectedRevision, occurredAt,
    })
    return { committed: !committed.duplicate, duplicate: committed.duplicate, state: committed.state?.state || committed.state || next }
  }

  listMemories() {
    return this.memory.list({ ownerKind: 'character', ownerId: this.characterId })
  }

  remember(text, { eventId = randomUUID() } = {}) {
    return this.memory.addCandidate({ ownerKind: 'character', ownerId: this.characterId, text, eventId, source: 'explicit-user-memory' })
  }

  removeMemory(memoryId) {
    return this.memory.remove({ ownerKind: 'character', ownerId: this.characterId, memoryId })
  }

  pinMemory(memoryId, pinned = true) {
    return this.memory.pin({ ownerKind: 'character', ownerId: this.characterId, memoryId, pinned })
  }

  editMemory(memoryId, text) {
    const item = this.store.getMemoryItem(memoryId)
    if (!item || item.ownerKind !== 'character' || item.ownerId !== this.characterId) return null
    const clean = String(text || '').trim()
    if (!clean || Array.from(clean).length > 400) throw invalid('MEMORY_TEXT_INVALID', '记忆内容应在 1～400 字之间')
    return this.store.updateMemoryItem(memoryId, { text: clean })
  }

  getConfiguration() {
    const loaded = this.loadState()
    return {
      schema: ROLE_CONFIGURATION_SCHEMA, revision: loaded.revision, irSha256: this.runtime.binding.irSha256,
      defaults: Object.fromEntries(['traits', 'style'].map(group => [group, Object.fromEntries(this.configFields.filter(x => x.group === group).map(f => [f.key, f.defaultValue]))])),
      effective: this.#effective(loaded.state.pplConfigOverrides),
      fields: this.configFields.map(f => ({ ...f })),
      configurationError: this.configurationError,
    }
  }

  previewConfiguration(raw) {
    const normalized = this.#normalizeConfiguration(raw)
    const candidate = this.#candidate(normalized)
    const baseline = candidate.initialState(this.characterId + '-preview')
    const scenarios = [
      { id: 'private', label: '私密交流', scene: this.defaultScene, event: { type: 'MESSAGE', actor: 'admin' } },
      { id: 'public', label: '公开场合', scene: this.publicScene, event: { type: 'MESSAGE', actor: 'admin' } },
      { id: 'comfort', label: '安慰支持', scene: this.defaultScene, event: { type: 'COMFORT', actor: 'admin' } },
      { id: 'trusted-close', label: '亲密关系约束', scene: this.defaultScene, event: { type: 'MESSAGE', actor: 'admin' }, relationshipStage: 'lover' },
    ]
    const checks = scenarios.map(s => {
      const state = deepClone(baseline)
      if (s.relationshipStage && state.relationships?.admin) state.relationships.admin.stage = s.relationshipStage
      let result
      try {
        result = candidate.resolve({ runtimeState: state, scene: s.scene, event: s.event })
      } catch (cause) {
        throw invalid('PPL_ROLE_PREVIEW_INVALID', s.label + ' 未通过 PPL 人格约束：' + String(cause.message || cause).slice(0, 140))
      }
      return { id: s.id, label: s.label, scene: s.scene, activeRules: result.resolution.activeRules.map(r => r.id) }
    })
    return { valid: true, irSha256: candidate.binding.irSha256, scenarios: checks, effective: this.#effective(normalized) }
  }

  saveConfiguration(raw, { expectedRevision } = {}) {
    const loaded = this.loadState()
    const normalized = this.#normalizeConfiguration(raw)
    const preview = this.previewConfiguration(normalized)
    const previous = this.#normalizeConfiguration(loaded.state.pplConfigOverrides)
    if (!this.configurationError && digest(previous) === digest(normalized)) {
      return { changed: false, configuration: this.getConfiguration(), preview, revision: loaded.revision }
    }
    const beforeEffective = this.#effective(previous)
    const afterEffective = this.#effective(normalized)
    const changes = this.configFields.filter(f => beforeEffective[f.group][f.key] !== afterEffective[f.group][f.key])
      .map(f => ({ group: f.group, key: f.key, label: f.path, before: beforeEffective[f.group][f.key], after: afterEffective[f.group][f.key] }))
    const saved = this.store.savePplConfiguration({
      characterId: this.characterId,
      state: { ...loaded.state, pplConfigOverrides: normalized },
      expectedRevision: expectedRevision ?? loaded.revision,
      beforeConfiguration: previous, afterConfiguration: normalized,
      changes, irSha256: preview.irSha256, schema: ROLE_CONFIGURATION_SCHEMA,
    })
    this.#syncConfiguration(normalized)
    return { changed: true, configuration: this.getConfiguration(), preview, revision: saved.revision }
  }
}
