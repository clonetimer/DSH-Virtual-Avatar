import { createHash } from 'node:crypto'
import { createDeepseekWhaleRuntime, createPplRuntime } from '../../ppl/index.mjs'
import {
  applyPplConfiguration,
  normalizePplConfiguration,
  resolvePplConfiguration,
  PPL_CONFIGURATION_SCHEMA,
  PPL_CONFIGURATION_FIELDS,
} from '../../ppl/configuration.mjs'
import { MemoryService } from '../../memory/service.mjs'
import { buildConversationContext } from './context-window.mjs'
import { createSummaryCandidate } from './memory-summary.mjs'
import { applyCompanionInteraction, createGrowthState } from './growth.mjs'
import { addConfirmedStoryFact, createStoryMemory, renderStoryContinuity, updateStorySummary } from './story-memory.mjs'
import {
  DEEPSEEK_WHALE_ID,
  DEEPSEEK_WHALE_PROFILE,
  buildDeepseekWhaleSystemPrompt,
  resolveDeepseekWhaleProfile,
} from './profile.mjs'
import {
  applyDeepseekWhaleAffection,
  classifyDeepseekWhaleEvent,
  createDeepseekWhaleInitialState,
  deepseekWhaleAffectionDelta,
  reconcileDeepseekWhalePplRelationship,
} from './relationship.mjs'

const TERMINAL_COMMIT_REASONS = new Set(['completed', 'max-tokens'])
const INTERACTION_SCENES = new Set(['PRIVATE_HOME', 'PUBLIC_SPACE'])
const DEFAULT_INTERACTION_SCENE = 'PRIVATE_HOME'

function mergeObjectDefaults(defaults, current = {}) {
  const out = { ...defaults, ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}) }
  for (const [key, value] of Object.entries(defaults || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeObjectDefaults(value, current?.[key])
    }
  }
  return out
}

function stableJson(value) {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function hashPplValue(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function flattenPplState(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenPplState(child, prefix ? prefix + '.' + key : key, out)
    }
  } else if (prefix) {
    out[prefix] = value
  }
  return out
}

function buildPplAudit(prepared, nextRuntimeState) {
  const resolution = prepared.pplResolution || {}
  const snapshot = prepared.pplSnapshot || {}
  const beforeState = prepared.baseState?.pplRuntime || {}
  const beforeFlat = flattenPplState(beforeState)
  const afterFlat = flattenPplState(nextRuntimeState || {})
  const stateChanges = [...new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)])]
    .filter(path => stableJson(beforeFlat[path]) !== stableJson(afterFlat[path]))
    .sort()
    .map(path => ({
      path,
      before: beforeFlat[path] === undefined ? null : beforeFlat[path],
      after: afterFlat[path] === undefined ? null : afterFlat[path],
    }))
  const context = prepared.context || {}
  const persona = snapshot.persona || {}
  const event = prepared.event || {}
  const diagnostics = Array.isArray(resolution.diagnostics) ? resolution.diagnostics : []
  return {
    schema: 'ppl.execution-audit/0.1',
    status: 'committed',
    persona: {
      id: persona.id || 'DEEPSEEK_WHALE',
      version: persona.version || null,
      irSha256: persona.irSha256 || null,
    },
    host: {
      kind: snapshot.host?.kind || 'dsh-virtual-avatar/deepseek-whale',
      turn: Number(snapshot.host?.turn ?? 0),
      step: Number(snapshot.host?.step ?? 1),
    },
    snapshotSha256: hashPplValue(snapshot),
    event: {
      type: event.type || null,
      actor: event.actor || null,
      subject: event.subject || null,
      signal: event.signal || null,
      classification: event.classification || null,
    },
    scene: prepared.interactionScene || DEFAULT_INTERACTION_SCENE,
    context: {
      privacy: context.privacy || null,
      outsiders_present: context.outsiders_present === true,
      danger: Number.isFinite(Number(context.danger)) ? Number(context.danger) : null,
    },
    resolution: {
      valid: resolution.valid === true,
      activeRules: (resolution.activeRules || []).map(item => typeof item === 'string'
        ? { id: item, priority: null }
        : { id: item.id || null, priority: Number.isFinite(item.priority) ? item.priority : null }),
      activeTransitions: resolution.activeTransitions || [],
      effectTrace: resolution.trace || {},
      pendingCommits: resolution.pendingCommits || [],
      pendingTransitions: resolution.pendingTransitions || [],
      invariants: resolution.invariantResults || [],
      diagnostics: diagnostics.map(item => ({
        code: item.code || null,
        severity: item.severity || null,
        message: String(item.message || '').slice(0, 240),
      })),
    },
    state: {
      beforeSha256: hashPplValue(beforeState),
      afterSha256: hashPplValue(nextRuntimeState || {}),
      changes: stateChanges,
    },
  }
}

export class DeepseekWhaleService {
  constructor({ store, memoryService, pplRuntime } = {}) {
    if (!store || typeof store.loadCharacterState !== 'function' || typeof store.commitCharacterTurn !== 'function') {
      throw new TypeError('DeepSeek Whale service requires a durable avatar store')
    }
    this.store = store
    this.memory = memoryService || new MemoryService({ store })
    this.ppl = pplRuntime || createDeepseekWhaleRuntime()
    this.basePplIr = this.ppl.ir ? structuredClone(this.ppl.ir) : null
    this.pplConfigurationHash = null
    this.pplConfigurationLoadError = null
  }

  #syncPplConfiguration(raw = {}) {
    if (!this.basePplIr) {
      if (raw && Object.keys(raw).length) {
        const error = new Error('the injected PPL runtime does not expose a mutable Persona IR')
        error.code = 'PPL_CONFIGURATION_RUNTIME_UNAVAILABLE'
        error.status = 503
        throw error
      }
      return { overrides: { schema: PPL_CONFIGURATION_SCHEMA, traits: {}, style: {} } }
    }
    const applied = applyPplConfiguration(this.basePplIr, raw)
    const configurationHash = hashPplValue(applied.overrides)
    if (configurationHash !== this.pplConfigurationHash) {
      this.ppl = createPplRuntime({
        persona: applied.persona,
        hostKind: 'dsh-virtual-avatar/deepseek-whale',
      })
      this.pplConfigurationHash = configurationHash
    }
    this.pplConfigurationOverrides = applied.overrides
    return applied
  }

  #initialState(sessionId) {
    const state = createDeepseekWhaleInitialState({ sessionId })
    state.storyMemory = createStoryMemory()
    state.growth = createGrowthState()
    state.pplRuntime = this.ppl.initialState(sessionId)
    return state
  }

  loadState({ sessionId = 'deepseek-whale' } = {}) {
    const loaded = this.store.loadCharacterState(DEEPSEEK_WHALE_ID)
    let appliedConfiguration
    try {
      appliedConfiguration = this.#syncPplConfiguration(loaded?.state?.pplConfigOverrides || {})
      this.pplConfigurationLoadError = null
    } catch (error) {
      appliedConfiguration = this.#syncPplConfiguration({})
      this.pplConfigurationLoadError = {
        code: error.code || 'PPL_CONFIGURATION_INVALID',
        message: String(error.message || error).slice(0, 180),
      }
    }
    if (!loaded) return { state: this.#initialState(sessionId), revision: 0, persisted: false }
    const state = structuredClone(loaded.state)
    state.pplConfigOverrides = appliedConfiguration.overrides
    state.pplRuntime = mergeObjectDefaults(this.ppl.initialState(sessionId), state.pplRuntime || {})
    if (!state.conversation) state.conversation = { log: [], chatLines: [], choices: [] }
    if (!state.storyMemory) state.storyMemory = createStoryMemory()
    if (!state.growth) state.growth = createGrowthState()
    if (!INTERACTION_SCENES.has(state.interactionScene)) state.interactionScene = DEFAULT_INTERACTION_SCENE
    return { state, revision: loaded.revision, updatedAt: loaded.updatedAt, persisted: true }
  }

  setInteractionScene(scene) {
    const selected = String(scene || '').trim()
    if (!INTERACTION_SCENES.has(selected)) {
      const error = new TypeError('interaction scene must be PRIVATE_HOME or PUBLIC_SPACE')
      error.code = 'INVALID_INTERACTION_SCENE'
      throw error
    }
    if (typeof this.store.saveCharacterState !== 'function') {
      throw new Error('avatar store does not support interaction-scene persistence')
    }
    const loaded = this.loadState()
    if (loaded.state.interactionScene === selected) {
      return { scene: selected, changed: false, revision: loaded.revision }
    }
    const next = { ...loaded.state, interactionScene: selected }
    const saved = this.store.saveCharacterState(DEEPSEEK_WHALE_ID, next, loaded.revision)
    return { scene: selected, changed: true, revision: saved.revision }
  }

  prepareTurn({
    text,
    choice = null,
    eventId,
    sessionId = 'deepseek-whale',
    turn,
    step = 1,
    context = {},
    activityHint = '',
    profileOverrides,
    now = new Date(),
  } = {}) {
    const input = String(text || '').trim().slice(0, 500)
    if (!input) throw new TypeError('user message required')
    if (!eventId) throw new TypeError('stable turn eventId required')
    const loaded = this.loadState({ sessionId })
    const event = classifyDeepseekWhaleEvent({ text: input, choice, eventId })
    const interactionScene = loaded.state.interactionScene || DEFAULT_INTERACTION_SCENE
    let resolved
    try {
      resolved = this.ppl.resolve({
        runtimeState: loaded.state.pplRuntime,
        scene: interactionScene,
        event,
        context,
        turn: turn ?? loaded.state.pplRuntime?.session?.turn ?? 0,
        step,
      })
    } catch (error) {
      try {
        this.store.recordPplResolutionFailure?.({
          eventId: String(eventId),
          characterId: DEEPSEEK_WHALE_ID,
          persona: this.ppl.binding || null,
          event,
          scene: interactionScene,
          context,
          error,
        })
      } catch (auditError) {
        error.auditFailure = String(auditError?.message || auditError).slice(0, 180)
      }
      throw error
    }
    const memoryContext = this.memory.retrieveContext({
      ownerKind: 'character',
      ownerId: DEEPSEEK_WHALE_ID,
      query: input,
      maxChars: 12000,
      limit: 20,
    })
    const profile = resolveDeepseekWhaleProfile(profileOverrides || loaded.state.profileOverrides || {})
    const system = buildDeepseekWhaleSystemPrompt({
      profile,
      pplStaticPrompt: resolved.staticPrompt,
      pplDynamicPrompt: resolved.dynamicPrompt,
      characterState: loaded.state,
      memories: memoryContext.items,
      activityHint,
      now,
    })
    const continuity = renderStoryContinuity(loaded.state.storyMemory)
    const systemWithContinuity = [system, continuity].filter(Boolean).join('\n\n')
    const contextWindow = buildConversationContext({
      history: loaded.state.conversation?.log || [],
      continuity,
      memories: memoryContext.items,
      recentMessages: 12,
      maxChars: 14000,
    })
    return {
      characterId: DEEPSEEK_WHALE_ID,
      eventId: String(eventId),
      input,
      choice: choice ? structuredClone(choice) : null,
      event,
      context: structuredClone(resolved.context || context || {}),
      interactionScene,
      profile,
      memoryContext,
      system: systemWithContinuity,
      contextMessages: contextWindow.messages,
      contextDiagnostics: { omittedMessages: contextWindow.omittedMessages, includedMessages: contextWindow.includedMessages, estimatedChars: contextWindow.estimatedChars },
      baseState: loaded.state,
      expectedRevision: loaded.revision,
      pplResolution: resolved.resolution,
      pplSnapshot: resolved.snapshot,
      pplStaticPrompt: resolved.staticPrompt,
      pplDynamicPrompt: resolved.dynamicPrompt,
    }
  }

  finalizeTurn(prepared, { reply, terminalReason = 'completed', emotion = 'normal', choices = [], provider = null, model = null, occurredAt = new Date().toISOString() } = {}) {
    if (!prepared || prepared.characterId !== DEEPSEEK_WHALE_ID) throw new TypeError('invalid prepared DeepSeek Whale turn')
    if (!TERMINAL_COMMIT_REASONS.has(String(terminalReason))) {
      return { committed: false, reason: String(terminalReason), state: prepared.baseState }
    }
    const response = String(reply || '').trim()
    if (!response) throw new TypeError('completed turn requires a non-empty reply')
    const pplFinal = this.ppl.finalize(prepared.baseState.pplRuntime, prepared.pplResolution, terminalReason)
    if (!pplFinal.committed) throw new Error('PPL runtime refused completed turn commit')

    const requestedAffectionDelta = deepseekWhaleAffectionDelta({ event: prepared.event })
    const growthResult = applyCompanionInteraction(prepared.baseState.growth || createGrowthState(), {
      eventId: prepared.eventId,
      delta: requestedAffectionDelta,
      occurredAt,
      source: 'companion-chat',
    })
    const affectionDelta = growthResult.deltaApplied
    const affectionResult = applyDeepseekWhaleAffection(prepared.baseState, { delta: affectionDelta })
    const next = affectionResult.state
    next.pplRuntime = pplFinal.runtimeState
    const reconciled = reconcileDeepseekWhalePplRelationship(next, pplFinal.runtimeState)
    reconciled.conversation = structuredClone(next.conversation || { log: [], chatLines: [], choices: [] })
    reconciled.conversation.log.push(
      { role: 'user', text: prepared.input },
      {
        role: 'assistant', text: response,
        ...(typeof provider === 'string' && provider ? { provider } : {}),
        ...(typeof model === 'string' && model ? { model } : {}),
      },
    )
    reconciled.conversation.chatLines.push({
      who: 'user',
      text: prepared.input,
      at: Date.now(),
      choiceId: prepared.choice?.id || null,
    })
    reconciled.conversation.chatLines.push({
      who: 'heroine',
      text: response,
      emotion: String(emotion || 'normal'),
      at: Date.now(),
    })
    reconciled.conversation.choices = Array.isArray(choices) ? structuredClone(choices) : []
    reconciled.storyMemory = reconciled.storyMemory || createStoryMemory()
    reconciled.growth = growthResult.growth
    reconciled.growth.affectionLifetime = Math.max(reconciled.growth.affectionLifetime, reconciled.affection || 0)

    if (affectionResult.levelUps.length) {
      for (const levelUp of affectionResult.levelUps) {
        reconciled.conversation.chatLines.push({
          who: 'narrator',
          text: '（好感度已满！鲸鱼娘的等级提升至 Lv.' + levelUp.level + '！正在为主人准备礼物……）',
          at: Date.now(),
        })
      }
      reconciled.conversation.choices = []
    }

    const pplAudit = buildPplAudit(prepared, pplFinal.runtimeState)
    const payload = {
      input: prepared.input,
      choiceId: prepared.choice?.id || null,
      reply: response,
      terminalReason,
      llmProvider: provider,
      llmModel: model,
      requestedAffectionDelta,
      affectionDelta,
      pplEventType: prepared.event.type,
      pplEventSubject: prepared.event.subject || null,
      pplEventSignal: prepared.event.signal || null,
      pplEventClassification: prepared.event.classification || null,
      pplStateBefore: prepared.baseState.pplRuntime?.state || {},
      pplStateAfter: pplFinal.runtimeState?.state || {},
      interactionScene: prepared.interactionScene || DEFAULT_INTERACTION_SCENE,
      pplContext: prepared.context,
      pplActiveRules: prepared.pplResolution?.activeRules?.map(rule => rule.id) || [],
      pplPendingTransitions: prepared.pplResolution?.pendingTransitions || [],
      pplSnapshotHash: pplAudit.snapshotSha256,
      pplIrSha256: pplAudit.persona.irSha256,
      pplAudit,
    }
    const committed = this.store.commitCharacterTurn({
      eventId: prepared.eventId,
      characterId: DEEPSEEK_WHALE_ID,
      payload,
      state: reconciled,
      expectedRevision: prepared.expectedRevision,
    })
    return {
      committed: !committed.duplicate,
      duplicate: committed.duplicate,
      state: committed.state?.state || committed.state || reconciled,
      revision: committed.revision ?? committed.state?.revision ?? null,
      requestedAffectionDelta,
      affectionDelta,
      levelUps: affectionResult.levelUps,
      relationship: reconciled.relationship,
    }
  }

  addConfirmedStoryFact({ id, text, sourceEventId, category = 'fact' } = {}) {
    const loaded = this.loadState()
    const result = addConfirmedStoryFact(loaded.state.storyMemory, { id, text, sourceEventId, category })
    if (result.duplicate) return { duplicate: true, revision: loaded.revision, storyMemory: result.storyMemory }
    const next = { ...loaded.state, storyMemory: result.storyMemory }
    const saved = this.store.saveCharacterState(DEEPSEEK_WHALE_ID, next, loaded.revision)
    return { duplicate: false, revision: saved.revision, storyMemory: result.storyMemory }
  }

  updateStorySummary({ summary, expectedStoryRevision } = {}) {
    const loaded = this.loadState()
    const storyMemory = updateStorySummary(loaded.state.storyMemory, { summary, expectedRevision: expectedStoryRevision })
    const saved = this.store.saveCharacterState(DEEPSEEK_WHALE_ID, { ...loaded.state, storyMemory }, loaded.revision)
    return { revision: saved.revision, storyMemory }
  }

  createMemorySummaryCandidate({ now = new Date().toISOString() } = {}) {
    const loaded = this.loadState()
    const memories = this.memory.list({ ownerKind: 'character', ownerId: DEEPSEEK_WHALE_ID })
    return createSummaryCandidate({
      history: loaded.state.conversation?.log || [],
      currentMemory: loaded.state.storyMemory || createStoryMemory(),
      memories,
      now,
    })
  }

  getStoryMemory() {
    return this.loadState().state.storyMemory || createStoryMemory()
  }

  remember(text, { eventId, source = 'user' } = {}) {
    return this.memory.addCandidate({
      ownerKind: 'character',
      ownerId: DEEPSEEK_WHALE_ID,
      text,
      eventId,
      source,
    })
  }

  listMemories({ query = '', level = 'all', pinned = 'all' } = {}) {
    const needle = String(query || '').trim().toLocaleLowerCase()
    const rows = this.memory.list({ ownerKind: 'character', ownerId: DEEPSEEK_WHALE_ID })
    return rows.filter(item => {
      if (needle && !String(item.text || '').toLocaleLowerCase().includes(needle)) return false
      if (level !== 'all' && item.level !== level) return false
      if (pinned === 'pinned' && !item.pinned) return false
      if (pinned === 'normal' && item.pinned) return false
      return true
    })
  }

  pinMemory(memoryId, pinned = true) {
    return this.memory.pin({ ownerKind: 'character', ownerId: DEEPSEEK_WHALE_ID, memoryId, pinned })
  }

  removeMemory(memoryId) {
    return this.memory.remove({ ownerKind: 'character', ownerId: DEEPSEEK_WHALE_ID, memoryId })
  }

  editMemory(memoryId, text) {
    const clean = String(text || '').trim()
    if (!clean) throw new TypeError('memory text required')
    if (Array.from(clean).length > 400) throw new RangeError('memory text exceeds 400 characters')
    const current = this.store.getMemoryItem(memoryId)
    if (!current || current.ownerKind !== 'character' || current.ownerId !== DEEPSEEK_WHALE_ID) return null
    return this.store.updateMemoryItem(memoryId, { text: clean, rawText: current.rawText || current.text })
  }

  exportMemories() {
    return {
      schema: 'dsh-virtual-avatar.memories/1',
      exportedAt: new Date().toISOString(),
      characterId: DEEPSEEK_WHALE_ID,
      memories: this.listMemories(),
    }
  }

  getPplConfiguration() {
    if (!this.basePplIr) {
      const error = new Error('PPL configuration requires a runtime with a Persona IR')
      error.code = 'PPL_CONFIGURATION_RUNTIME_UNAVAILABLE'
      error.status = 503
      throw error
    }
    const loaded = this.loadState()
    const resolved = resolvePplConfiguration(this.basePplIr, loaded.state.pplConfigOverrides || {})
    return {
      ...resolved,
      revision: loaded.revision,
      irSha256: this.ppl.binding.irSha256,
      configurationError: this.pplConfigurationLoadError,
    }
  }

  previewPplConfiguration(raw = {}) {
    if (!this.basePplIr) {
      const error = new Error('PPL configuration requires a runtime with a Persona IR')
      error.code = 'PPL_CONFIGURATION_RUNTIME_UNAVAILABLE'
      error.status = 503
      throw error
    }
    const applied = applyPplConfiguration(this.basePplIr, raw)
    const candidate = createPplRuntime({
      persona: applied.persona,
      hostKind: 'dsh-virtual-avatar/deepseek-whale',
    })
    const scenarios = [
      { id: 'private-chat', label: '私密日常交流', scene: 'PRIVATE_HOME', event: { type: 'MESSAGE', actor: 'admin' } },
      { id: 'comfort', label: '安慰与支持', scene: 'PRIVATE_HOME', event: { type: 'COMFORT', actor: 'admin', subject: 'character', signal: 'comfort' } },
      { id: 'praise', label: '赞美与鼓励', scene: 'PRIVATE_HOME', event: { type: 'PRAISE', actor: 'admin', subject: 'character', signal: 'praise' } },
      { id: 'public-space', label: '公开场合', scene: 'PUBLIC_SPACE', event: { type: 'MESSAGE', actor: 'admin' } },
    ]
    const results = scenarios.map(scenario => {
      const result = candidate.resolve({
        runtimeState: candidate.initialState('ppl-configuration-preview'),
        scene: scenario.scene,
        event: scenario.event,
        turn: 1,
        step: 1,
      })
      if (!result.resolution.valid) {
        const error = new Error('PPL configuration failed scenario validation: ' + scenario.label)
        error.code = 'PPL_CONFIGURATION_SCENARIO_INVALID'
        error.status = 400
        error.diagnostics = result.resolution.diagnostics
        throw error
      }
      return {
        id: scenario.id,
        label: scenario.label,
        scene: scenario.scene,
        activeRules: result.resolution.activeRules.map(rule => rule.id),
        traits: result.resolution.resolved.traits,
        style: result.resolution.resolved.style,
        behaviors: result.resolution.resolved.behaviors,
      }
    })
    return {
      schema: PPL_CONFIGURATION_SCHEMA,
      valid: true,
      irSha256: candidate.binding.irSha256,
      effective: applied.effective,
      scenarios: results,
    }
  }

  updatePplConfiguration(raw = {}, { expectedRevision } = {}) {
    if (!this.basePplIr) {
      const error = new Error('PPL configuration requires a runtime with a Persona IR')
      error.code = 'PPL_CONFIGURATION_RUNTIME_UNAVAILABLE'
      error.status = 503
      throw error
    }
    const loaded = this.loadState()
    const applied = applyPplConfiguration(this.basePplIr, raw)
    const preview = this.previewPplConfiguration(applied.overrides)
    const previousOverrides = normalizePplConfiguration(loaded.state.pplConfigOverrides || {}, this.basePplIr)
    if (!this.pplConfigurationLoadError && hashPplValue(previousOverrides) === hashPplValue(applied.overrides)) {
      return {
        changed: false,
        revision: loaded.revision,
        configuration: this.getPplConfiguration(),
        preview,
      }
    }
    const previous = resolvePplConfiguration(this.basePplIr, previousOverrides).effective
    const changes = PPL_CONFIGURATION_FIELDS
      .map(field => ({
        group: field.group,
        key: field.key,
        label: field.label,
        before: previous[field.group][field.key],
        after: applied.effective[field.group][field.key],
      }))
      .filter(change => change.before !== change.after)
    const next = { ...loaded.state, pplConfigOverrides: applied.overrides }
    const saveOptions = {
      characterId: DEEPSEEK_WHALE_ID,
      state: next,
      expectedRevision: expectedRevision ?? loaded.revision,
      beforeConfiguration: previousOverrides,
      afterConfiguration: applied.overrides,
      changes,
      irSha256: hashPplValue(applied.persona),
    }
    const saved = typeof this.store.savePplConfiguration === 'function'
      ? this.store.savePplConfiguration(saveOptions)
      : this.store.saveCharacterState(DEEPSEEK_WHALE_ID, next, saveOptions.expectedRevision)
    this.#syncPplConfiguration(applied.overrides)
    return {
      changed: true,
      revision: saved.revision,
      configuration: this.getPplConfiguration(),
      preview,
    }
  }

  resetPplConfiguration({ expectedRevision } = {}) {
    return this.updatePplConfiguration({}, { expectedRevision })
  }

  updateProfile(overrides, { expectedRevision } = {}) {
    const loaded = this.loadState()
    const profile = resolveDeepseekWhaleProfile(overrides)
    const next = { ...loaded.state, profileOverrides: Object.fromEntries(
      Object.entries(profile).filter(([key, value]) => PROFILE_OVERRIDE_FIELDS.includes(key) && value !== DEEPSEEK_WHALE_PROFILE[key]),
    ) }
    return this.store.saveCharacterState(DEEPSEEK_WHALE_ID, next, expectedRevision ?? loaded.revision)
  }
}

const PROFILE_OVERRIDE_FIELDS = Object.freeze(['displayName', 'address', 'greeting', 'persona', 'tone', 'visual'])
