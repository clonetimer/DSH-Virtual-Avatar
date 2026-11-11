import { createHash } from 'node:crypto'

const KINDS = new Set(['agent', 'companion'])
const FORMATS = new Set(['markdown', 'ppl-ir', 'native'])

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

export class PersonaRegistry {
  #items = new Map()
  #bindings = new Map()

  list({ kind } = {}) {
    return [...this.#items.values()]
      .filter(item => !kind || item.kind === kind)
      .map(item => structuredClone(item))
  }

  get(id) {
    const item = this.#items.get(String(id))
    return item ? structuredClone(item) : null
  }

  upsert(input, expectedRevision) {
    if (!input || typeof input !== 'object') throw new TypeError('persona definition required')
    const id = String(input.id || '').trim()
    const kind = String(input.kind || '')
    const format = String(input.sourceFormat || '')
    if (!id) throw new TypeError('persona id required')
    if (!KINDS.has(kind)) throw new TypeError('persona kind must be agent or companion')
    if (!FORMATS.has(format)) throw new TypeError('unsupported persona sourceFormat')
    if (typeof input.content !== 'string' || !input.content.trim()) throw new TypeError('persona content required')

    const previous = this.#items.get(id)
    if (previous && expectedRevision !== undefined && previous.revision !== expectedRevision) {
      const error = new Error('persona revision conflict')
      error.code = 'REVISION_CONFLICT'
      throw error
    }
    if (!previous && expectedRevision !== undefined && expectedRevision !== 0) {
      const error = new Error('persona does not exist at expected revision')
      error.code = 'REVISION_CONFLICT'
      throw error
    }
    const contentHash = hash(input.content)
    const next = {
      id,
      kind,
      name: String(input.name || id),
      version: String(input.version || '1.0.0'),
      sourceFormat: format,
      content: input.content,
      contentHash,
      enabled: input.enabled !== false,
      revision: (previous?.revision || 0) + 1,
      metadata: structuredClone(input.metadata || {}),
      createdAt: previous?.createdAt || input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.#items.set(id, next)
    return structuredClone(next)
  }

  remove(id) {
    const key = String(id)
    const removed = this.#items.delete(key)
    if (removed) {
      for (const [bindingKey, personaId] of this.#bindings) {
        if (personaId === key) this.#bindings.delete(bindingKey)
      }
    }
    return removed
  }

  bind({ scope, scopeId, personaId }) {
    if (!['global', 'workspace', 'session', 'character'].includes(scope)) throw new TypeError('invalid binding scope')
    const id = String(personaId || '')
    const persona = this.#items.get(id)
    if (!persona || !persona.enabled) throw new Error('persona missing or disabled')
    const key = this.#bindingKey(scope, scopeId)
    this.#bindings.set(key, id)
    return { scope, scopeId: String(scopeId || ''), personaId: id }
  }

  resolveBinding({ scope, scopeId }) {
    const id = this.#bindings.get(this.#bindingKey(scope, scopeId))
    const item = id ? this.#items.get(id) : null
    return item && item.enabled ? structuredClone(item) : null
  }

  #bindingKey(scope, scopeId) {
    return scope + ':' + String(scopeId || '')
  }
}
