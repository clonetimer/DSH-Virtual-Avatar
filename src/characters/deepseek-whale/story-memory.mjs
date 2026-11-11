const MAX_SUMMARY_CHARS = 1800
const MAX_EVENTS = 80
const MAX_THREADS = 30

function cleanText(value, limit = 240) {
  return String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function createStoryMemory() {
  return {
    version: 1,
    summary: '',
    confirmedFacts: [],
    keyEvents: [],
    openThreads: [],
    lastUpdatedAt: null,
    revision: 0,
  }
}

export function normalizeStoryMemory(value) {
  const source = value && typeof value === 'object' ? value : {}
  const base = createStoryMemory()
  return {
    ...base,
    ...source,
    summary: cleanText(source.summary, MAX_SUMMARY_CHARS),
    confirmedFacts: Array.isArray(source.confirmedFacts) ? source.confirmedFacts.slice(-100) : [],
    keyEvents: Array.isArray(source.keyEvents) ? source.keyEvents.slice(-MAX_EVENTS) : [],
    openThreads: Array.isArray(source.openThreads) ? source.openThreads.slice(-MAX_THREADS) : [],
    revision: Math.max(0, Number(source.revision) || 0),
  }
}

/** Durable user facts are added only after explicit confirmation. */
export function addConfirmedStoryFact(storyMemory, { id, text, sourceEventId, category = 'fact', now = new Date().toISOString() } = {}) {
  const state = normalizeStoryMemory(storyMemory)
  const clean = cleanText(text, 240)
  if (!clean) throw new TypeError('companion memory fact text required')
  if (!id || !sourceEventId) throw new TypeError('stable fact id and sourceEventId required')
  const existing = state.confirmedFacts.find(item => item.id === id)
  if (existing) {
    if (existing.text !== clean || existing.sourceEventId !== sourceEventId) {
      const error = new Error('companion memory fact id conflict')
      error.code = 'MEMORY_FACT_CONFLICT'
      throw error
    }
    return { duplicate: true, storyMemory: state }
  }
  state.confirmedFacts.push({ id, text: clean, category: cleanText(category, 32), sourceEventId, confirmedAt: now })
  state.revision += 1
  state.lastUpdatedAt = now
  return { duplicate: false, storyMemory: state }
}

export function appendStoryEvent(storyMemory, { id, title, detail = '', sourceEventId, now = new Date().toISOString() } = {}) {
  const state = normalizeStoryMemory(storyMemory)
  if (!id || !sourceEventId) throw new TypeError('companion event id and sourceEventId required')
  const existing = state.keyEvents.find(item => item.id === id)
  if (existing) return { duplicate: true, storyMemory: state }
  state.keyEvents.push({
    id,
    title: cleanText(title, 80),
    detail: cleanText(detail, 240),
    sourceEventId,
    occurredAt: now,
  })
  state.keyEvents = state.keyEvents.slice(-MAX_EVENTS)
  state.revision += 1
  state.lastUpdatedAt = now
  return { duplicate: false, storyMemory: state }
}

export function updateStorySummary(storyMemory, { summary, expectedRevision, now = new Date().toISOString() } = {}) {
  const state = normalizeStoryMemory(storyMemory)
  if (expectedRevision !== undefined && state.revision !== expectedRevision) {
    const error = new Error('companion summary revision conflict')
    error.code = 'REVISION_CONFLICT'
    throw error
  }
  const clean = cleanText(summary, MAX_SUMMARY_CHARS)
  if (!clean) throw new TypeError('companion summary required')
  state.summary = clean
  state.revision += 1
  state.lastUpdatedAt = now
  return state
}

export function renderStoryContinuity(storyMemory) {
  const state = normalizeStoryMemory(storyMemory)
  const sections = []
  if (state.summary) sections.push('【长期相处摘要】\n' + state.summary)
  if (state.confirmedFacts.length) sections.push('【已确认的用户事实】\n' + state.confirmedFacts.slice(-20).map(item => '- ' + item.text).join('\n'))
  if (state.keyEvents.length) sections.push('【共同经历与重要事件】\n' + state.keyEvents.slice(-12).map(item => '- ' + item.title + (item.detail ? '：' + item.detail : '')).join('\n'))
  if (state.openThreads.length) sections.push('【尚未完成的约定】\n' + state.openThreads.slice(-10).map(item => '- ' + cleanText(item.text, 160)).join('\n'))
  return sections.join('\n\n')
}
