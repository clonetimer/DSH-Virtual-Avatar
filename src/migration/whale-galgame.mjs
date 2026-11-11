import { createHash } from 'node:crypto'

const sha = text => createHash('sha256').update(text).digest('hex')
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

export function inspectWhaleGlobalSave(raw) {
  if (typeof raw !== 'string') throw new TypeError('Whale save must be JSON text')
  let parsed
  try { parsed = JSON.parse(raw) } catch (cause) {
    const error = new Error('Whale global save is not valid JSON', { cause })
    error.code = 'INVALID_SOURCE_JSON'
    throw error
  }
  if (!isObject(parsed)) throw new TypeError('Whale global save root must be an object')
  const characters = isObject(parsed.characters) ? parsed.characters : {}
  const characterIds = Object.keys(characters)
  const mediaDataUrls = []
  const seen = new WeakSet()
  function walk(value, path = '$') {
    if (typeof value === 'string') {
      if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) mediaDataUrls.push({ path, mimeType: value.slice(5, value.indexOf(';')), byteLength: Buffer.from(value.slice(value.indexOf(',') + 1), 'base64').length, sha256: sha(value) })
      return
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, path + '[' + index + ']'))
    else for (const [key, entry] of Object.entries(value)) walk(entry, path + '.' + key)
  }
  walk(parsed)
  return {
    sourceKind: 'whale-galgame',
    sourceHash: sha(raw),
    byteLength: Buffer.byteLength(raw, 'utf8'),
    rootKeys: Object.keys(parsed),
    characterIds,
    characterCount: characterIds.length,
    characters: characterIds.map(id => {
      const c = characters[id]
      return {
        id,
        level: Number.isFinite(c?.level) ? c.level : null,
        affection: Number.isFinite(c?.affection) ? c.affection : null,
        chatEntries: Array.isArray(c?.log) ? c.log.length : (Array.isArray(c?.chatLines) ? c.chatLines.length : 0),
        hasCustomProfile: Boolean(c?.profile || c?.customProfile),
      }
    }),
    mediaDataUrls,
    parsed,
  }
}
