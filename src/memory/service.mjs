import { createHash, randomUUID } from 'node:crypto'

const OWNERS = new Set(['shared', 'agent-persona', 'character'])
const DEFAULT_SIMILARITY_THRESHOLD = 0.6
const DEFAULT_MAX_ITEM_CHARS = 400

function normalizedBigrams(text) {
  const clean = Array.from(String(text || '').replace(/[\s\p{P}\p{S}]/gu, ''))
  const counts = new Map()
  if (clean.length === 1) counts.set(clean[0], 1)
  for (let index = 0; index < clean.length - 1; index++) {
    const pair = clean[index] + clean[index + 1]
    counts.set(pair, (counts.get(pair) || 0) + 1)
  }
  return counts
}

export function memorySimilarity(left, right) {
  const a = normalizedBigrams(left)
  const b = normalizedBigrams(right)
  if (!a.size || !b.size) return 0
  let shared = 0
  let total = 0
  for (const [key, count] of a) {
    total += count
    shared += Math.min(count, b.get(key) || 0)
  }
  for (const count of b.values()) total += count
  return total ? (2 * shared) / total : 0
}

function payloadHash(value) {
  return createHash('sha256').update(JSON.stringify({
    ownerKind: value.ownerKind,
    ownerId: value.ownerId,
    text: value.text,
    source: value.source,
  })).digest('hex')
}

function assertOwner(ownerKind, ownerId) {
  if (!OWNERS.has(ownerKind)) throw new TypeError('invalid memory owner kind')
  if (typeof ownerId !== 'string' || !ownerId.trim()) throw new TypeError('memory owner id required')
}

export class MemoryService {
  constructor({ store, similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD, maxItemChars = DEFAULT_MAX_ITEM_CHARS } = {}) {
    if (!store || typeof store.listMemoryItems !== 'function') throw new TypeError('memory store required')
    this.store = store
    this.similarityThreshold = similarityThreshold
    this.maxItemChars = maxItemChars
  }

  list({ ownerKind, ownerId }) {
    assertOwner(ownerKind, ownerId)
    return this.store.listMemoryItems(ownerKind, ownerId)
  }

  addCandidate({ ownerKind, ownerId, text, eventId, source = 'user', now = new Date().toISOString() }) {
    assertOwner(ownerKind, ownerId)
    const clean = String(text || '').trim()
    if (!clean) throw new TypeError('memory text required')
    if (Array.from(clean).length > this.maxItemChars) throw new RangeError('memory text exceeds ' + this.maxItemChars + ' characters')
    if (!eventId) throw new TypeError('memory eventId required')
    const hash = payloadHash({ ownerKind, ownerId, text: clean, source })
    return this.store.transaction(() => {
      const previousEvent = this.store.findMemoryEvent(eventId)
      if (previousEvent) {
        if (previousEvent.payloadHash !== hash) {
          const error = new Error('memory event id was reused with a different payload')
          error.code = 'MEMORY_EVENT_CONFLICT'
          throw error
        }
        return { duplicate: true, memory: previousEvent.memoryId ? this.store.getMemoryItem(previousEvent.memoryId) : null }
      }

      const rows = this.store.listMemoryItems(ownerKind, ownerId)
      let match = null
      for (const row of rows) {
        const score = memorySimilarity(clean, row.text)
        if (score >= this.similarityThreshold && (!match || score > match.score)) match = { row, score }
      }

      let memory
      if (match) {
        const current = match.row
        const hitCount = current.hitCount + 1
        memory = this.store.updateMemoryItem(current.id, {
          text: clean.length > current.text.length ? clean : current.text,
          hitCount,
          pinned: current.pinned,
          level: current.pinned ? 'core' : 'mid',
          lastSeenAt: now,
          source: current.source || source,
        })
      } else {
        memory = this.store.insertMemoryItem({
          id: randomUUID(),
          ownerKind,
          ownerId,
          text: clean,
          pinned: false,
          hitCount: 0,
          level: 'edge',
          source,
          sourceEventId: String(eventId),
          createdAt: now,
          lastSeenAt: now,
          updatedAt: now,
        })
      }

      this.store.recordMemoryEvent({ eventId, ownerKind, ownerId, payloadHash: hash, memoryId: memory.id })
      this.store.setMemoryEventMemoryId(eventId, memory.id)
      return { duplicate: false, merged: Boolean(match), similarity: match?.score ?? 0, memory }
    })
  }

  pin({ ownerKind, ownerId, memoryId, pinned = true }) {
    assertOwner(ownerKind, ownerId)
    const current = this.store.getMemoryItem(memoryId)
    if (!current || current.ownerKind !== ownerKind || current.ownerId !== ownerId) return null
    return this.store.updateMemoryItem(memoryId, {
      pinned: pinned === true,
      level: pinned ? 'core' : current.hitCount > 0 ? 'mid' : 'edge',
    })
  }

  remove({ ownerKind, ownerId, memoryId }) {
    assertOwner(ownerKind, ownerId)
    const current = this.store.getMemoryItem(memoryId)
    if (!current || current.ownerKind !== ownerKind || current.ownerId !== ownerId) return false
    return this.store.deleteMemoryItem(memoryId)
  }

  buildContext({ ownerKind, ownerId, maxChars = 32000 }) {
    assertOwner(ownerKind, ownerId)
    if (!Number.isInteger(maxChars) || maxChars < 0) throw new TypeError('maxChars must be a non-negative integer')
    const rows = this.store.listMemoryItems(ownerKind, ownerId)
    const pinned = rows.filter(row => row.pinned)
    const rest = rows.filter(row => !row.pinned).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    const selected = new Set(pinned.map(row => row.id))
    let used = pinned.reduce((sum, row) => sum + Array.from(row.text).length + 1, 0)
    for (const row of rest) {
      const cost = Array.from(row.text).length + 1
      if (used + cost > maxChars) continue
      selected.add(row.id)
      used += cost
    }
    const items = rows.filter(row => selected.has(row.id))
    return {
      items,
      text: items.map(row => '- ' + row.text).join('\n'),
      charCount: used,
      pinnedOverflow: used > maxChars,
      omittedCount: rows.length - items.length,
    }
  }
}
