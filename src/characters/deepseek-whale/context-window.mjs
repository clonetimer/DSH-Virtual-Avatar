const DEFAULT_RECENT_MESSAGES = 12
const DEFAULT_MAX_CHARS = 14000

function contentOf(item) {
  return String(item?.text ?? item?.content ?? '')
}

export function buildConversationContext({ history = [], continuity = '', memories = [], recentMessages = DEFAULT_RECENT_MESSAGES, maxChars = DEFAULT_MAX_CHARS } = {}) {
  if (!Array.isArray(history) || !Array.isArray(memories)) throw new TypeError('history and memories must be arrays')
  if (!Number.isInteger(recentMessages) || recentMessages < 1) throw new TypeError('recentMessages must be positive')
  if (!Number.isInteger(maxChars) || maxChars < 256) throw new TypeError('maxChars must be at least 256')
  const sections = []
  if (continuity) sections.push(String(continuity).trim())
  if (memories.length) sections.push('【相关长期记忆】\n' + memories.map(item => '- ' + contentOf(item)).join('\n'))
  let fixedText = sections.filter(Boolean).join('\n\n')
  if (fixedText.length > maxChars) fixedText = fixedText.slice(0, maxChars)
  const recent = history.slice(-recentMessages)
  const selected = []
  let used = fixedText.length
  for (let index = recent.length - 1; index >= 0; index--) {
    const item = recent[index]
    const text = contentOf(item)
    const cost = text.length + 16
    if (used + cost > maxChars) break
    selected.unshift({ role: item.role === 'assistant' || item.who === 'heroine' ? 'assistant' : 'user', content: text })
    used += cost
  }
  return {
    messages: selected,
    continuity: fixedText,
    omittedMessages: Math.max(0, history.length - selected.length),
    includedMessages: selected.length,
    estimatedChars: used,
    truncated: selected.length < history.length,
  }
}
