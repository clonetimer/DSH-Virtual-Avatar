import { createHash } from 'node:crypto'
import { affectionCap } from './profile.mjs'

const POSITIVE_TEXT = /(?:喜欢和你聊天|喜欢陪你|想陪你|想你|我想你|想见你|亲亲|约会)/u
const NEGATIVE_TEXT = /^(?:我)?(?:(?:真的|有点|很)?(?:不喜欢你|讨厌你|不爱你|不想和你在一起)|别烦我|滚开|走开)(?:[呀啊呢啦哦嘛吧，。！？!?～~]*)$/u
const USER_STRESS_TEXT = /(?:我(?:今天|最近|这几天)?(?:真的|有点|特别|好|很)?(?:累(?:了)?|疲惫|压力(?:很)?大|焦虑|难过|沮丧|委屈|不开心|心情不好)|(?:最近|这几天)(?:工作|学习|事情)?(?:真的|有点|特别|好|很)?(?:累|疲惫|压力大|焦虑))/u
const USER_SUPPORT_TEXT = /(?:陪陪我|陪着我|陪我一会(?:儿)?|陪我聊聊|安慰我|抱抱我|能抱抱我吗|给我一个抱抱|我需要(?:你)?(?:陪伴|安慰)|我想有人陪|我现在需要你|你能陪我吗)/u
const CHARACTER_REST_TEXT = /(?:你(?:也)?(?:先)?(?:好好)?休息(?:一下)?吧|你(?:也)?歇一会(?:儿)?吧|去休息吧|早点休息吧|别太累了|不要太累|别勉强自己|照顾好自己|先去睡吧|去睡一会(?:儿)?)/u
const CHARACTER_COMFORT_TEXT = /(?:辛苦了|你(?:今天|最近)?(?:一定)?(?:好|很|有点)?累(?:了)?(?:吧|吗)?|你累了吧|别(?:再)?撑着|别逞强|心疼你|抱歉让你等|我来陪你|有我陪着你|你已经做得很好|你也需要被照顾)/u
const PRAISE_TEXT = /(?:你真可爱|你很可爱|你太可爱|你真棒|你很棒|你做得很好|你今天表现得很好|好厉害|你好厉害|我为你骄傲|夸夸你)/u
const CONFESSION_TEXT = /^(?:我)?(?:(?:真的)?(?:很)?(?:喜欢你|爱你|想和你在一起|想和你交往|愿意和你交往|做我的恋人|想成为你的恋人|对你有好感)|告白)(?:[呀啊呢啦哦嘛吧，。！？!?～~]*)$/u

function normalizeInteractionText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function userStressSignal(text) {
  if (/(?:累|疲惫)/u.test(text)) return 'fatigue'
  if (/(?:焦虑|压力|紧张)/u.test(text)) return 'anxiety'
  return 'sadness'
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function createDeepseekWhaleInitialState({ sessionId = 'deepseek-whale' } = {}) {
  return {
    characterId: 'deepseek',
    level: 1,
    affection: 0,
    interactionScene: 'PRIVATE_HOME',
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

/** Classify user intent without treating the user's distress as comfort given to the character. */
export function classifyDeepseekWhaleEvent({ text = '', choice = null, eventId, source = 'companion' } = {}) {
  const input = String(text || '').trim().slice(0, 500)
  const normalized = normalizeInteractionText(input)
  let type = 'MESSAGE'
  let subject = 'conversation'
  let signal = 'neutral'
  let classification = { method: 'default', rule: 'neutral-message' }

  if (choice?.effect === -1) {
    type = 'NEGATIVE_INTERACTION'
    subject = 'character'
    signal = 'negative'
    classification = { method: 'choice', rule: 'negative-choice' }
  } else if (NEGATIVE_TEXT.test(normalized)) {
    type = 'NEGATIVE_INTERACTION'
    subject = 'character'
    signal = 'negative'
    classification = { method: 'pattern', rule: 'explicit-negative' }
  } else if (CONFESSION_TEXT.test(normalized)) {
    type = 'CONFESSION'
    subject = 'relationship'
    signal = 'affection'
    classification = { method: 'pattern', rule: 'explicit-confession' }
  } else if (USER_STRESS_TEXT.test(normalized)) {
    type = 'USER_STRESS_DISCLOSURE'
    subject = 'user'
    signal = userStressSignal(normalized)
    classification = { method: 'pattern', rule: 'user-stress-disclosure', signal }
  } else if (USER_SUPPORT_TEXT.test(normalized)) {
    type = 'USER_SUPPORT_REQUEST'
    subject = 'user'
    signal = 'support-request'
    classification = { method: 'pattern', rule: 'user-support-request' }
  } else if (CHARACTER_REST_TEXT.test(normalized)) {
    type = 'CHARACTER_REST_ENCOURAGEMENT'
    subject = 'character'
    signal = 'rest'
    classification = { method: 'pattern', rule: 'character-rest-encouragement' }
  } else if (CHARACTER_COMFORT_TEXT.test(normalized)) {
    type = 'COMFORT'
    subject = 'character'
    signal = 'comfort'
    classification = { method: 'pattern', rule: 'character-directed-comfort' }
  } else if (PRAISE_TEXT.test(normalized)) {
    type = 'PRAISE'
    subject = 'character'
    signal = 'praise'
    classification = { method: 'pattern', rule: 'explicit-praise' }
  } else if (choice?.effect === 1) {
    type = 'POSITIVE_INTERACTION'
    subject = 'relationship'
    signal = 'positive'
    classification = { method: 'choice', rule: 'positive-choice' }
  } else if (POSITIVE_TEXT.test(normalized) || /(?:抱抱|想抱你)/u.test(normalized)) {
    type = 'POSITIVE_INTERACTION'
    subject = 'relationship'
    signal = 'positive'
    classification = { method: 'pattern', rule: 'positive-affection' }
  }

  const payload = {
    type,
    actor: 'admin',
    subject,
    signal,
    text: input,
    choiceId: choice?.id || null,
    source,
    classification,
  }
  return {
    eventId: String(eventId || ''),
    ...payload,
    payloadHash: hash(payload),
  }
}

/** Affection is intentionally separate from support-seeking, comfort and stress disclosure. */
export function deepseekWhaleAffectionDelta({ event, text = '', choice = null } = {}) {
  const classified = event || classifyDeepseekWhaleEvent({ text, choice })
  if (classified.type === 'NEGATIVE_INTERACTION') return -1
  if (['CONFESSION', 'POSITIVE_INTERACTION', 'PRAISE'].includes(classified.type)) return 1
  return 0
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
