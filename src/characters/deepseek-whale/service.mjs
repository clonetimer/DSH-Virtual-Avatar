import { createDeepseekWhaleRuntime } from '../../ppl/index.mjs'
import { MemoryService } from '../../memory/service.mjs'
import { buildConversationContext } from './context-window.mjs'
import { createSummaryCandidate } from './memory-summary.mjs'
import { applyCompanionInteraction, createGrowthState } from './growth.mjs'
import { addConfirmedStoryFact, appendStoryEvent, createStoryMemory, renderStoryContinuity, updateStorySummary } from './story-memory.mjs'
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

export class DeepseekWhaleService {
  constructor({ store, memoryService, pplRuntime } = {}) {
    if (!store || typeof store.loadCharacterState !== 'function' || typeof store.commitCharacterTurn !== 'function') {
      throw new TypeError('DeepSeek Whale service requires a durable avatar store')
    }
    this.store = store
    this.memory = memoryService || new MemoryService({ store })
    this.ppl = pplRuntime || createDeepseekWhaleRuntime()
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
    if (!loaded) return { state: this.#initialState(sessionId), revision: 0, persisted: false }
    const state = structuredClone(loaded.state)
    if (!state.pplRuntime) state.pplRuntime = this.ppl.initialState(sessionId)
    if (!state.conversation) state.conversation = { log: [], chatLines: [], choices: [] }
    if (!state.storyMemory) state.storyMemory = createStoryMemory()
    if (!state.growth) state.growth = createGrowthState()
    return { state, revision: loaded.revision, updatedAt: loaded.updatedAt, persisted: true }
  }

  prepareTurn({
    text,
    choice = null,
    eventId,
    sessionId = 'deepseek-whale',
    turn,
    step = 1,
    context = { privacy: 'private', outsiders_present: false, danger: 0 },
    activityHint = '',
    profileOverrides,
    now = new Date(),
  } = {}) {
    const input = String(text || '').trim().slice(0, 500)
    if (!input) throw new TypeError('user message required')
    if (!eventId) throw new TypeError('stable turn eventId required')
    const loaded = this.loadState({ sessionId })
    const event = classifyDeepseekWhaleEvent({ text: input, choice, eventId })
    const resolved = this.ppl.resolve({
      runtimeState: loaded.state.pplRuntime,
      event,
      context,
      turn: turn ?? loaded.state.pplRuntime?.session?.turn ?? 0,
      step,
    })
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
    const systemWithContinuity = [system, continuity].filter(Boolean).join('\\n\\n')
    const contextWindow = buildConversationContext({
      history: loaded.state.conversation?.log || [],
      continuity,
      memories: memoryContext.items,
      recentTurns: 12,
      maxChars: 14000,
    })
    return {
      characterId: DEEPSEEK_WHALE_ID,
      eventId: String(eventId),
      input,
      choice: choice ? structuredClone(choice) : null,
      event,
      context: structuredClone(context),
      profile,
      memoryContext,
      system: systemWithContinuity,
      contextMessages: contextWindow.messages,
      contextDiagnostics: { omittedTurns: contextWindow.omittedTurns, includedTurns: contextWindow.includedTurns, estimatedChars: contextWindow.estimatedChars },
      baseState: loaded.state,
      expectedRevision: loaded.revision,
      pplResolution: resolved.resolution,
      pplSnapshot: resolved.snapshot,
      pplStaticPrompt: resolved.staticPrompt,
      pplDynamicPrompt: resolved.dynamicPrompt,
    }
  }

  finalizeTurn(prepared, { reply, terminalReason = 'completed', emotion = 'normal', choices = [] } = {}) {
    if (!prepared || prepared.characterId !== DEEPSEEK_WHALE_ID) throw new TypeError('invalid prepared DeepSeek Whale turn')
    if (!TERMINAL_COMMIT_REASONS.has(String(terminalReason))) {
      return { committed: false, reason: String(terminalReason), state: prepared.baseState }
    }
    const response = String(reply || '').trim()
    if (!response) throw new TypeError('completed turn requires a non-empty reply')
    const pplFinal = this.ppl.finalize(prepared.baseState.pplRuntime, prepared.pplResolution, terminalReason)
    if (!pplFinal.committed) throw new Error('PPL runtime refused completed turn commit')

    const affectionDelta = deepseekWhaleAffectionDelta({ text: prepared.input, choice: prepared.choice })
    const affectionResult = applyDeepseekWhaleAffection(prepared.baseState, { delta: affectionDelta })
    const next = affectionResult.state
    next.pplRuntime = pplFinal.runtimeState
    const reconciled = reconcileDeepseekWhalePplRelationship(next, pplFinal.runtimeState)
    reconciled.conversation = structuredClone(next.conversation || { log: [], chatLines: [], choices: [] })
    reconciled.conversation.log.push(
      { role: 'user', text: prepared.input },
      { role: 'assistant', text: response },
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
    const growthResult = applyCompanionInteraction(reconciled.growth || createGrowthState(), {
      eventId: prepared.eventId,
      delta: affectionDelta,
      occurredAt: new Date().toISOString(),
      source: prepared.choice ? 'choice' : 'chat',
    })
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

    const payload = {
      input: prepared.input,
      choiceId: prepared.choice?.id || null,
      reply: response,
      terminalReason,
      affectionDelta,
      pplEventType: prepared.event.type,
      pplSnapshotHash: prepared.pplSnapshot?.persona?.irSha256 || null,
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

  listMemories() {
    return this.memory.list({ ownerKind: 'character', ownerId: DEEPSEEK_WHALE_ID })
  }

  pinMemory(memoryId, pinned = true) {
    return this.memory.pin({ ownerKind: 'character', ownerId: DEEPSEEK_WHALE_ID, memoryId, pinned })
  }

  removeMemory(memoryId) {
    return this.memory.remove({ ownerKind: 'character', ownerId: DEEPSEEK_WHALE_ID, memoryId })
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
