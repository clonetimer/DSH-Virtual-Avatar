import { createHash } from 'node:crypto'
const sha = value => createHash('sha256').update(value).digest('hex')
const MAX_SUMMARY_CHARS = 1600
function clean(value, max = 240) {
  return String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
export function createSummaryCandidate({ history = [], currentMemory = {}, memories = [], now = new Date().toISOString() } = {}) {
  if (!Array.isArray(history) || !Array.isArray(memories)) throw new TypeError('history and memories must be arrays')
  const recent = history.slice(-40)
  const userLines = recent.filter(item => item.role === 'user' || item.who === 'user').map(item => clean(item.text, 160)).filter(Boolean)
  const assistantLines = recent.filter(item => item.role === 'assistant' || item.who === 'heroine').map(item => clean(item.text, 120)).filter(Boolean)
  const facts = Array.isArray(currentMemory.confirmedFacts) ? currentMemory.confirmedFacts.slice(-12).map(item => clean(item.text, 120)) : []
  const events = Array.isArray(currentMemory.keyEvents) ? currentMemory.keyEvents.slice(-8).map(item => clean(item.title, 100)) : []
  const memoryTexts = memories.slice(0, 12).map(item => clean(item.text, 100)).filter(Boolean)
  const summary = clean([
    facts.length ? '已确认事实：' + facts.join('；') : '',
    events.length ? '共同经历：' + events.join('；') : '',
    memoryTexts.length ? '长期记忆：' + memoryTexts.join('；') : '',
    userLines.length ? '近期用户表达：' + userLines.slice(-8).join('；') : '',
    assistantLines.length ? '近期陪伴回应：' + assistantLines.slice(-4).join('；') : '',
  ].filter(Boolean).join('\n'), MAX_SUMMARY_CHARS)
  return {
    candidateId: sha(JSON.stringify({ summary, now })).slice(0, 24),
    summary,
    sourceRange: { recentMessageCount: recent.length, firstMessage: recent[0]?.at || null, lastMessage: recent.at(-1)?.at || null },
    sourceHash: sha(JSON.stringify({ recent, facts, events, memoryTexts })),
    expectedRevision: Math.max(0, Number(currentMemory.revision) || 0),
    generatedAt: now,
    requiresUserConfirmation: true,
    warning: '这是基于现有记录整理的候选摘要；确认前不会覆盖已保存的长期摘要。',
  }
}
