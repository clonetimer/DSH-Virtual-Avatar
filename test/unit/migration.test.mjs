import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectVirtualPersonMarkdown } from '../../src/migration/virtual-person.mjs'
import { inspectWhaleGlobalSave } from '../../src/migration/whale-galgame.mjs'
import { inspectPplPersonaIr } from '../../src/migration/ppl.mjs'
import { createMigrationPreview } from '../../src/migration/plan.mjs'

test('virtual-person parser preserves raw source and extracts pin/hit metadata', () => {
  const raw = '# 角色\n人格正文\n\n## 记忆\n- 2026-10-28 13:20："普通记忆"；\n- 2026-10-29 02:10："钉住记忆"^3*；\n自定义备注'
  const result = inspectVirtualPersonMarkdown(raw)
  assert.equal(result.raw, raw)
  assert.equal(result.memories.length, 2)
  assert.equal(result.memories[0].pinned, false)
  assert.equal(result.memories[1].pinned, true)
  assert.equal(result.memories[1].hitCount, 3)
  assert.deepEqual(result.unknownMemoryLines, ['自定义备注'])
})

test('Whale inspector is read-only and reports six character summaries and embedded media', () => {
  const raw = JSON.stringify({
    currentCharacter: 'deepseek',
    characters: Object.fromEntries(['deepseek','claude','chatgpt','gemini','kimi','grok'].map(id => [id, { level: 2, affection: 12, log: [{ text: 'hi' }] }])),
    customSprite: 'data:image/png;base64,aGVsbG8=',
  })
  const result = inspectWhaleGlobalSave(raw)
  assert.equal(result.characterCount, 6)
  assert.equal(result.characters[0].chatEntries, 1)
  assert.equal(result.mediaDataUrls.length, 1)
  assert.equal(result.mediaDataUrls[0].byteLength, 5)
  assert.equal(raw, JSON.stringify(JSON.parse(raw)))
})

test('PPL inspector rejects unsupported IR and accepts 0.3', () => {
  assert.throws(() => inspectPplPersonaIr({ schema: 'ppl.persona-ir/0.2' }), { code: 'UNSUPPORTED_PPL_SCHEMA' })
  const result = inspectPplPersonaIr({ schema: 'ppl.persona-ir/0.3', persona: { id: 'CETACEA', version: '0.3' }, meta: { display_name: '鲸鱼娘' }, rules: [] })
  assert.equal(result.personaId, 'CETACEA')
  assert.equal(result.displayName, '鲸鱼娘')
})

test('migration preview performs no writes and requires explicit confirmation', () => {
  const result = createMigrationPreview([
    { sourceKind: 'virtual-person', sourceHash: 'a', memories: [1,2], unknownMemoryLines: ['x'] },
    { sourceKind: 'whale-galgame', sourceHash: 'b', characterCount: 6, mediaDataUrls: [1] },
  ])
  assert.equal(result.writesPerformed, false)
  assert.equal(result.requiresExplicitConfirmation, true)
  assert.equal(result.totalRecords, 8)
  assert.deepEqual(result.sources[0].warnings, ['UNKNOWN_MEMORY_LINES:1'])
})
