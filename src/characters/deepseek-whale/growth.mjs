import { createHash } from 'node:crypto'

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const MAX_DAILY_BONUS = 2

export function createGrowthState() {
  return {
    affectionLifetime: 0,
    dailyInteractionCount: 0,
    dailyBonusCount: 0,
    dailyKey: '',
    lastInteractionAt: null,
    interactionStreak: 0,
    lastInteractionDay: '',
    levelRewardsClaimed: [],
    revision: 0,
  }
}

export function applyCompanionInteraction(growth, { eventId, delta = 0, occurredAt = new Date().toISOString(), source = 'chat' } = {}) {
  if (!eventId) throw new TypeError('growth eventId required')
  if (![-1,0,1].includes(delta)) throw new TypeError('growth delta must be -1, 0 or 1')
  const state = { ...createGrowthState(), ...(growth || {}) }
  const day = String(occurredAt).slice(0,10)
  const fingerprint = sha({ eventId, delta, source })
  const seen = Array.isArray(state.appliedEvents) ? state.appliedEvents : []
  const previous = seen.find(item => item.eventId === eventId)
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      const error = new Error('growth event id conflict')
      error.code = 'GROWTH_EVENT_CONFLICT'
      throw error
    }
    return { duplicate: true, growth: state, deltaApplied: 0 }
  }
  if (state.dailyKey !== day) {
    state.dailyKey = day
    state.dailyInteractionCount = 0
    state.dailyBonusCount = 0
  }
  state.dailyInteractionCount += 1
  let applied = delta
  if (delta > 0 && state.dailyBonusCount >= MAX_DAILY_BONUS) applied = 0
  else if (delta > 0) state.dailyBonusCount += 1
  state.affectionLifetime = Math.max(0, Number(state.affectionLifetime || 0) + applied)
  if (state.lastInteractionDay !== day) {
    const yesterday = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0,10)
    state.interactionStreak = state.lastInteractionDay === yesterday ? state.interactionStreak + 1 : 1
    state.lastInteractionDay = day
  }
  state.lastInteractionAt = occurredAt
  state.appliedEvents = [...seen, { eventId, fingerprint }].slice(-500)
  state.revision += 1
  return { duplicate: false, growth: state, deltaApplied: applied }
}
