const EMOTION_RULES = Object.freeze([
  { key: 'anger', threshold: 0.65, expression: 'angry', label: '有些不开心', motion: 'tense', priority: 4 },
  { key: 'grief', threshold: 0.60, expression: 'serious', label: '有点低落', motion: 'subdued', priority: 3 },
  { key: 'anxiety', threshold: 0.65, expression: 'frightened', label: '略显紧张', motion: 'nervous', priority: 2 },
  { key: 'embarrassment', threshold: 0.70, expression: 'shy', label: '很害羞', motion: 'shy', priority: 1 },
])

const REPLY_EXPRESSIONS = new Set([
  'cheerful', 'shy', 'serious', 'confused',
  'angry', 'frightened', 'exasperated', 'starry',
])

const EXPRESSION_LABELS = Object.freeze({
  neutral: '自然',
  cheerful: '开心',
  shy: '害羞',
  serious: '认真',
  confused: '疑惑',
  angry: '不开心',
  frightened: '紧张',
  exasperated: '无奈',
  starry: '憧憬',
})

const PAT_REACTIONS = Object.freeze({
  neutral: { expression: 'shy', reply: '嘿嘿，主人摸摸我啦～' },
  cheerful: { expression: 'cheerful', reply: '嗯嗯，好开心呀～再摸摸？' },
  shy: { expression: 'shy', reply: '嘿嘿，主人摸摸我啦～' },
  serious: { expression: 'serious', reply: '谢谢主人，我会继续努力的。' },
  confused: { expression: 'confused', reply: '咦？主人这是在摸摸我吗？' },
  angry: { expression: 'angry', reply: '唔……主人轻一点啦。' },
  frightened: { expression: 'frightened', reply: '呀，吓我一跳……' },
  exasperated: { expression: 'exasperated', reply: '唔……主人别闹啦。' },
  starry: { expression: 'starry', reply: '呀，像海浪一样舒服呢～' },
})

function unit(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}

/**
 * Resolve the Whale's visible expression from her own PPL state.
 *
 * PPL state takes precedence over a one-turn text heuristic. The last reply's
 * emotion is only a fallback when no persistent PPL emotion crosses its
 * presentation threshold. This never writes back to PPL or relationship data.
 */
export function resolveDeepseekWhalePresentation({ pplState = {}, replyEmotion = 'normal' } = {}) {
  const state = {
    anger: unit(pplState?.anger),
    grief: unit(pplState?.grief),
    anxiety: unit(pplState?.anxiety),
    embarrassment: unit(pplState?.embarrassment),
    fatigue: unit(pplState?.fatigue),
  }

  const active = EMOTION_RULES
    .map(rule => ({ ...rule, intensity: state[rule.key] / rule.threshold }))
    .filter(rule => rule.intensity >= 1)
    .sort((a, b) => b.intensity - a.intensity || b.priority - a.priority)

  const dominant = active[0] || null
  const reply = REPLY_EXPRESSIONS.has(String(replyEmotion)) ? String(replyEmotion) : null
  const expression = dominant?.expression || reply || 'neutral'
  const source = dominant ? 'ppl-state' : reply ? 'reply' : 'baseline'
  const expressionLabel = dominant?.label || EXPRESSION_LABELS[expression] || '自然'
  const mood = state.anger >= 0.65
    ? '有些不开心'
    : state.grief >= 0.60
      ? '有点低落'
      : state.anxiety >= 0.65
        ? '略显紧张'
        : '平静'
  const shyness = state.embarrassment >= 0.70
    ? '很害羞'
    : state.embarrassment >= 0.35
      ? '有点害羞'
      : '自然'
  const motion = dominant?.motion || (state.fatigue >= 0.75 ? 'resting' : 'calm')
  const tempo = state.fatigue >= 0.75 ? 'slow' : 'normal'
  const patReaction = PAT_REACTIONS[expression] || PAT_REACTIONS.neutral

  return {
    expression,
    expressionLabel,
    patExpression: patReaction.expression,
    patReply: patReaction.reply,
    expressionSource: source,
    asset: expression === 'neutral' ? 'maid-left.webp' : 'whale-' + expression + '.webp',
    mood,
    shyness,
    motion,
    tempo,
    state: { ...state },
  }
}
