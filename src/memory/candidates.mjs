const MEMORY_PATTERNS = [
  { type: 'preference', pattern: /(?:我喜欢|我很喜欢|我不喜欢|我讨厌|我偏好|我更喜欢)([^。！？!?\\n]{2,48})/u },
  { type: 'identity', pattern: /(?:我是|我目前是|我正在)([^。！？!?\\n]{2,48})/u },
  { type: 'project', pattern: /(?:我在做|我正在做|我的项目是|我负责)([^。！？!?\\n]{2,64})/u },
  { type: 'schedule', pattern: /(?:我通常|我每天|我每周|我一般)([^。！？!?\\n]{2,48})/u },
]

export function extractMemoryCandidates(text) {
  const input = String(text || '').trim()
  if (!input) return []
  const candidates = []
  const seen = new Set()
  for (const row of MEMORY_PATTERNS) {
    const match = row.pattern.exec(input)
    if (!match) continue
    const value = match[0].trim().replace(/[。！？!?]+$/u, '')
    if (Array.from(value).length < 4 || seen.has(value)) continue
    seen.add(value)
    candidates.push({
      text: value,
      category: row.type,
      reason: '用户以明确陈述表达了可能长期有效的信息',
      requiresConfirmation: true,
      sourceText: input,
    })
  }
  return candidates.slice(0, 3)
}
