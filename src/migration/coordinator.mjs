import { randomUUID } from 'node:crypto'
import { inspectVirtualPersonMarkdown } from './virtual-person.mjs'
import { inspectWhaleGlobalSave } from './whale-galgame.mjs'
import { inspectPplPersonaIr } from './ppl.mjs'
import { createMigrationPreview } from './plan.mjs'

const INSPECTORS = {
  'virtual-person': inspectVirtualPersonMarkdown,
  'whale-galgame': inspectWhaleGlobalSave,
  'ppl-persona-ir': inspectPplPersonaIr,
}

/** Preview/stage/explicit-commit coordinator. The injected store owns durable transactions. */
export class MigrationCoordinator {
  #store
  #staged = new Map()

  constructor({ store } = {}) {
    if (!store || typeof store.hasSource !== 'function' || typeof store.commitMigration !== 'function') {
      throw new TypeError('migration store must implement hasSource and commitMigration')
    }
    this.#store = store
  }

  inspect(sourceKind, raw) {
    const inspect = INSPECTORS[sourceKind]
    if (!inspect) throw new TypeError('unsupported migration source kind: ' + sourceKind)
    return inspect(raw)
  }

  preview(inputs) {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new TypeError('at least one migration source is required')
    const inspections = inputs.map(({ sourceKind, raw }) => this.inspect(sourceKind, raw))
    const base = createMigrationPreview(inspections)
    const sources = base.sources.map(source => ({ ...source, alreadyImported: this.#store.hasSource(source.sourceKind, source.sourceHash) }))
    return { ...base, sources, totalRecords: sources.filter(source => !source.alreadyImported).reduce((sum, source) => sum + source.records, 0) }
  }

  stage(inputs) {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new TypeError('at least one migration source is required')
    const inspections = inputs.map(({ sourceKind, raw }) => this.inspect(sourceKind, raw))
    const plan = { id: randomUUID(), createdAt: new Date().toISOString(), preview: createMigrationPreview(inspections), inspections, status: 'staged' }
    this.#staged.set(plan.id, plan)
    return { id: plan.id, status: plan.status, preview: plan.preview }
  }

  async commit(stagedId, { confirmed = false } = {}) {
    if (confirmed !== true) {
      const error = new Error('explicit migration confirmation is required')
      error.code = 'CONFIRMATION_REQUIRED'
      throw error
    }
    const plan = this.#staged.get(String(stagedId))
    if (!plan) {
      const error = new Error('staged migration not found')
      error.code = 'STAGE_NOT_FOUND'
      throw error
    }
    if (plan.status !== 'staged') {
      const error = new Error('staged migration is not committable')
      error.code = 'INVALID_STAGE_STATE'
      throw error
    }
    const result = await this.#store.commitMigration({
      migrationId: plan.id,
      sources: plan.inspections.map(inspection => ({ sourceKind: inspection.sourceKind, sourceHash: inspection.sourceHash, inspection })),
    })
    plan.status = 'committed'
    plan.result = result
    return { id: plan.id, status: plan.status, result }
  }

  discard(stagedId) {
    const plan = this.#staged.get(String(stagedId))
    if (!plan || plan.status !== 'staged') return false
    plan.status = 'discarded'
    plan.inspections = []
    return true
  }

  getStage(stagedId) {
    const plan = this.#staged.get(String(stagedId))
    return plan ? { id: plan.id, status: plan.status, preview: plan.preview, result: plan.result ?? null } : null
  }
}
