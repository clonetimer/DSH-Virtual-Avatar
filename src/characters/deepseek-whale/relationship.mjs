import { createHash } from 'node:crypto'
import { affectionCap } from './profile.mjs'

const POSITIVE_TEXT = /喜欢|爱你|可爱|想你|陪你|晚安|早安|抱抱|亲亲|约会|月圆/u
const NEGATIVE_TEXT = /讨厌|烦|滚|走开|无聊|再见/u
const COMFORT_TEXT = /辛苦|累了|很累|休息|靠一会|靠着|别撑|别逞强|心疼|抱歉让你等/u
const CONFESSION_TEXT = /喜欢你|爱你|和我在一起|交往|告白|做我的恋人/u

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function createDeepseekWhaleInitialState({ sessionId = 'deepseek-whale' } = {}) {
  return {
    characterId: 'deepseek',
    level: 1,
    affection: 0,
    relationship: {
      stage: 'acquaintance',
      trust: 0.5,
      attachment: 0.1,
      confessionAccepted: false,
    },
    pplRuntime: {
      relationships: {
        admin: {
          stage: 'acquaintance',
          trust: 0.5,
          attachment: 0.1,
          confession: { accepted: false },
        },
      },
      state: {
        physical: { fatigue: 0.1 },
        emotion: { embarrassment: 0.25 },
      },
      session: { id: sessionId, turn: 0 },
    },
    conversation: {
      log: [],
      chatLines: [],
      choices: [],
    },
    updatedAt: new Date().toISOString(),
  }
}

/** Convert a completed Galgame input into a deterministic PPL domain event. */
export function classifyDeepseekWhaleEvent({ text = '', choice = null, eventId, source = 'galgame' } = {}) {
  const input = String(text || '').trim()
  let type = 'MESSAGE'
  if (CONFESSION_TEXT.test(input)) type = 'CONFESSION'
  else if (COMFORT_TEXT.test(input)) type = 'COMFORT'
  else if (choice?.effect === 1 || POSITIVE_TEXT.test(input)) type = 'POSITIVE_INTERACTION'
  else if (choice?.effect === -1 || NEGATIVE_TEXT.test(input)) type = 'NEGATIVE_INTERACTION'
  const payload = { type, actor: 'admin', text: input, choiceId: choice?.id || null, source }
  return {
    eventId: String(eventId || ''),
    ...payload,
    payloadHash: hash(payload),
  }
}

export function applyDeepseekWhaleAffection(state, { delta = 0 } = {}) {
  if (![ -1, 0, 1 ].includes(delta)) throw new TypeError('affection delta must be -1, 0 or 1')
  const next = structuredClone(state)
  const before = Math.max(0, Number(next.affection) || 0)
  const beforeLevel = Math.max(1, Number(next.level) || 1)
  next.level = beforeLevel
  next.affection = Math.max(0, before + delta)
  const levelUps = []
  while (next.affection >= affectionCap(next.level)) {
    const cap = affectionCap(next.level)
    next.affection = Math.max(0, next.affection - cap)
    next.level += 1
    levelUps.push({ level: next.level, consumed: cap })
  }
  next.updatedAt = new Date().toISOString()
  return {
    state: next,
    delta: next.affection - before,
    requestedDelta: delta,
    levelUps,
  }
}

export function reconcileDeepseekWhalePplRelationship(characterState, pplRuntimeState) {
  const next = structuredClone(characterState)
  const relationship = pplRuntimeState?.relationships?.admin || {}
  next.relationship = {
    stage: String(relationship.stage || next.relationship?.stage || 'acquaintance'),
    trust: Math.max(0, Math.min(1, Number(relationship.trust ?? next.relationship?.trust ?? 0.5))),
    attachment: Math.max(0, Math.min(1, Number(relationship.attachment ?? next.relationship?.attachment ?? 0.1))),
    confessionAccepted: relationship.confession?.accepted === true,
  }
  next.pplRuntime = structuredClone(pplRuntimeState)
  next.updatedAt = new Date().toISOString()
  return next
}
