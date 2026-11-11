const DEFAULT_RECENT_TURNS = 12
const DEFAULT_MAX_CHARS = 14000

function lineText(item) {
  return String(item?.text || '')
}

export function buildConversationContext({ history = [], storyContinuity = '', recentTurns = DEFAULT_RECENT_TURNS, maxChars = DEFAULT_MAX_CHARS } = {}) {
  if (!Array.isArray(history)) throw new TypeError('conversation history must be an array')
  if (!Number.isInteger(recentTurns) || recentTurns < 1) throw new TypeError('recentTurns must be positive')
  if (!Number.isInteger(maxChars) || maxChars < 256) throw new TypeError('maxChars must be at least 256')
  const recent = history.slice(-recentTurns)
  const prefix = String(storyContinuity || '').trim()
  const selected = []
  let used = prefix.length
  for (let index = recent.length - 1; index >= 0; index--) {
    const item = recent[index]
    const cost = lineText(item).length + 16
    if (used + cost > maxChars && selected.length) break
    if (used + cost > maxChars) continue
    selected.unshift(item)
    used += cost
  }
  return {
    messages: selected.map(item => ({ role: item.role === 'assistant' || item.who === 'heroine' ? 'assistant' : 'user', content: lineText(item) })),
    continuity: prefix,
    omittedTurns: Math.max(0, history.length - selected.length),
    includedTurns: selected.length,
    estimatedChars: used,
    truncated: selected.length < history.length,
  }
}
