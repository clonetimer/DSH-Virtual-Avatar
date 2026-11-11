import test from 'node:test'
import assert from 'node:assert/strict'
import { PersonaRegistry } from '../../src/persona/registry.mjs'

test('registry validates kinds and stores revisioned definitions', () => {
  const registry = new PersonaRegistry()
  const first = registry.upsert({ id: 'main', kind: 'agent', sourceFormat: 'markdown', content: '# Agent' })
  assert.equal(first.revision, 1)
  const second = registry.upsert({ ...first, content: '# Updated' }, first.revision)
  assert.equal(second.revision, 2)
  assert.throws(() => registry.upsert({ ...second, content: '# Conflict' }, 1), { code: 'REVISION_CONFLICT' })
  assert.throws(() => registry.upsert({ id: 'bad', kind: 'companion', sourceFormat: 'xml', content: 'x' }))
})

test('bindings are scoped and disabled personas do not resolve', () => {
  const registry = new PersonaRegistry()
  registry.upsert({ id: 'agent', kind: 'agent', sourceFormat: 'markdown', content: 'agent' })
  registry.upsert({ id: 'heroine', kind: 'companion', sourceFormat: 'native', content: 'heroine' })
  registry.bind({ scope: 'global', personaId: 'agent' })
  registry.bind({ scope: 'character', scopeId: 'whale', personaId: 'heroine' })
  assert.equal(registry.resolveBinding({ scope: 'global' }).id, 'agent')
  assert.equal(registry.resolveBinding({ scope: 'character', scopeId: 'whale' }).id, 'heroine')
  assert.equal(registry.resolveBinding({ scope: 'character', scopeId: 'other' }), null)
  registry.upsert({ id: 'heroine', kind: 'companion', sourceFormat: 'native', content: 'heroine', enabled: false }, 1)
  assert.equal(registry.resolveBinding({ scope: 'character', scopeId: 'whale' }), null)
})
