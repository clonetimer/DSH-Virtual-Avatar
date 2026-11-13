import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHARACTER_ARTWORK_SCHEMA = 'dsh-virtual-avatar.character-artwork/1'
const MIME_TYPES = Object.freeze({
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
})
const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/u
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u
const MAX_ASSET_BYTES = 12 * 1024 * 1024

function emptyArtwork(characterId, status = 'missing') {
  return {
    schema: CHARACTER_ARTWORK_SCHEMA,
    characterId,
    status,
    portraitUrl: null,
    expressions: {},
    motion: null,
    attribution: null,
  }
}

export class CharacterArtworkRegistry {
  constructor({ root = fileURLToPath(new URL('../../../assets/characters/', import.meta.url)) } = {}) {
    this.root = resolve(root)
  }

  #manifest(characterId) {
    if (!SAFE_ID.test(String(characterId || ''))) return null
    const directory = resolve(this.root, characterId)
    if (!directory.startsWith(this.root + sep)) return null
    const manifestPath = join(directory, 'manifest.json')
    if (!existsSync(manifestPath)) return null
    try {
      const info = lstatSync(manifestPath)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) return null
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (manifest.schema !== CHARACTER_ARTWORK_SCHEMA || manifest.characterId !== characterId) return null
      if (!manifest.expressions || typeof manifest.expressions !== 'object' || Array.isArray(manifest.expressions)) return null
      return { directory, manifest }
    } catch {
      return null
    }
  }

  #resolveAsset(characterId, filename, manifestData = this.#manifest(characterId)) {
    if (!manifestData || typeof filename !== 'string' || !SAFE_FILE.test(filename)) return null
    const extension = extname(filename).toLowerCase()
    const contentType = MIME_TYPES[extension]
    if (!contentType) return null
    const candidate = resolve(manifestData.directory, filename)
    if (!candidate.startsWith(manifestData.directory + sep)) return null
    try {
      const info = lstatSync(candidate)
      if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > MAX_ASSET_BYTES) return null
      const actual = realpathSync(candidate)
      if (actual !== candidate) return null
      return { path: candidate, contentType, size: info.size, filename }
    } catch {
      return null
    }
  }

  get(characterId) {
    const data = this.#manifest(characterId)
    if (!data) return emptyArtwork(characterId, 'missing')
    const { manifest } = data
    const portrait = this.#resolveAsset(characterId, manifest.portrait, data)
    const expressions = {}
    for (const [name, filename] of Object.entries(manifest.expressions)) {
      if (!/^[a-z][a-z0-9_-]{0,31}$/u.test(name)) continue
      const asset = this.#resolveAsset(characterId, filename, data)
      if (asset) expressions[name] = '/api/dsh-virtual-avatar/assets/characters/' + characterId + '/' + asset.filename
    }
    return {
      schema: CHARACTER_ARTWORK_SCHEMA,
      characterId,
      status: portrait ? 'ready' : String(manifest.status || 'missing'),
      portraitUrl: portrait
        ? '/api/dsh-virtual-avatar/assets/characters/' + characterId + '/' + portrait.filename
        : null,
      expressions,
      motion: manifest.motion && typeof manifest.motion === 'object' ? manifest.motion : null,
      attribution: manifest.attribution && typeof manifest.attribution === 'object' ? manifest.attribution : null,
    }
  }

  readAsset(characterId, filename) {
    const data = this.#manifest(characterId)
    if (!data) return null
    const allowed = new Set([
      data.manifest.portrait,
      ...Object.values(data.manifest.expressions || {}),
    ].filter(value => typeof value === 'string'))
    if (!allowed.has(filename)) return null
    return this.#resolveAsset(characterId, filename, data)
  }
}

export function createCharacterArtworkRegistry(options) {
  return new CharacterArtworkRegistry(options)
}
