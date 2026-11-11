import { createHash } from 'node:crypto'

const sha = text => createHash('sha256').update(text).digest('hex')
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const MEDIA_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,/i

function collectMedia(value, path, output, seen = new WeakSet()) {
  if (typeof value === 'string') {
    if (MEDIA_DATA_URL.test(value)) {
      const comma = value.indexOf(',')
      const mimeType = value.slice(5, value.indexOf(';')).toLowerCase()
      const bytes = Buffer.from(value.slice(comma + 1).replace(/\s/g, ''), 'base64')
      output.push({ path, mimeType, byteLength: bytes.length, sha256: sha(bytes) })
    }
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) value.forEach((entry, index) => collectMedia(entry, path + '[' + index + ']', output, seen))
  else for (const [key, entry] of Object.entries(value)) collectMedia(entry, path + '.' + key, output, seen)
}

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
  collectMedia(parsed, '$', mediaDataUrls)

  const deepseekMediaDataUrls = []
  if (Object.prototype.hasOwnProperty.call(characters, 'deepseek')) {
    collectMedia(characters.deepseek, '$.characters.deepseek', deepseekMediaDataUrls)
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'bg')) collectMedia(parsed.bg, '$.bg', deepseekMediaDataUrls)
  if (Object.prototype.hasOwnProperty.call(parsed, 'cg')) collectMedia(parsed.cg, '$.cg', deepseekMediaDataUrls)

  const importedPaths = new Set(deepseekMediaDataUrls.map(item => item.path))
  const deferredMediaDataUrls = mediaDataUrls.filter(item => !importedPaths.has(item.path))

  return {
    sourceKind: 'whale-galgame',
    sourceHash: sha(raw),
    byteLength: Buffer.byteLength(raw, 'utf8'),
    rootKeys: Object.keys(parsed),
    characterIds,
    characterCount: characterIds.length,
    deepseekAvailable: Object.prototype.hasOwnProperty.call(characters, 'deepseek'),
    deferredCharacterIds: characterIds.filter(id => id !== 'deepseek'),
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
    deepseekMediaDataUrls,
    deferredMediaDataUrls,
    parsed,
    raw,
  }
}
