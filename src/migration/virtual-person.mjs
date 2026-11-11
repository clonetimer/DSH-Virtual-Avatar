import { createHash } from 'node:crypto'

const sha = text => createHash('sha256').update(text).digest('hex')
const MEMORY_LINE = /^-\s+(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*[：:]\s*(.*)$/

export function inspectVirtualPersonMarkdown(raw) {
  if (typeof raw !== 'string') throw new TypeError('AGENT.md content must be a string')
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const memoryHeading = lines.findIndex(line => /^##\s+记忆\s*$/.test(line.trim()))
  const personaLines = memoryHeading < 0 ? lines : lines.slice(0, memoryHeading)
  const memoryLines = memoryHeading < 0 ? [] : lines.slice(memoryHeading + 1)
  const memories = []
  const unknownMemoryLines = []
  for (const line of memoryLines) {
    const match = MEMORY_LINE.exec(line.trim())
    if (!match) {
      if (line.trim() && !/^#{1,6}\s/.test(line.trim())) unknownMemoryLines.push(line)
      continue
    }
    const tail = match[3]
    const pinned = /[*]\s*[；;]?\s*$/.test(tail)
    const hitMatch = /\^(\d{1,4})\s*[；;]?\s*$/.exec(tail)
    const body = tail.replace(/[*]\s*[；;]?\s*$/, '').replace(/\^\d{1,4}\s*[；;]?\s*$/, '').replace(/[；;]\s*$/, '').trim()
    memories.push({ date: match[1], time: match[2], body, pinned, hitCount: hitMatch ? Number(hitMatch[1]) : 0, raw: line })
  }
  return {
    sourceKind: 'virtual-person',
    sourceHash: sha(raw),
    byteLength: Buffer.byteLength(raw, 'utf8'),
    personaMarkdown: personaLines.join('\n').trim(),
    memoryHeadingFound: memoryHeading >= 0,
    memories,
    unknownMemoryLines,
    raw,
  }
}
