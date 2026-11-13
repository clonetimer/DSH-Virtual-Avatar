import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CharacterArtworkRegistry,
  CHARACTER_ARTWORK_SCHEMA,
} from '../../src/characters/artwork/registry.mjs'

test('character artwork registry exposes only a manifest-approved local portrait and expressions', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-character-artwork-'))
  try {
    const directory = join(root, 'ppl-zhuang-fangyi')
    mkdirSync(directory)
    writeFileSync(join(directory, 'portrait.webp'), Buffer.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]))
    writeFileSync(join(directory, 'happy.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    writeFileSync(join(directory, 'private-extra.png'), Buffer.from([1, 2, 3]))
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
      schema: CHARACTER_ARTWORK_SCHEMA,
      characterId: 'ppl-zhuang-fangyi',
      status: 'ready',
      portrait: 'portrait.webp',
      expressions: { happy: 'happy.png' },
      motion: null,
      attribution: { source: 'user-approved-private-artwork', scope: 'personal-use' },
    }))
    const registry = new CharacterArtworkRegistry({ root })
    const view = registry.get('ppl-zhuang-fangyi')
    assert.equal(view.status, 'ready')
    assert.equal(view.portraitUrl, '/api/dsh-virtual-avatar/assets/characters/ppl-zhuang-fangyi/portrait.webp')
    assert.equal(view.expressions.happy, '/api/dsh-virtual-avatar/assets/characters/ppl-zhuang-fangyi/happy.png')
    assert.equal(registry.readAsset('ppl-zhuang-fangyi', 'portrait.webp').contentType, 'image/webp')
    assert.equal(registry.readAsset('ppl-zhuang-fangyi', 'happy.png').contentType, 'image/png')
    assert.equal(registry.readAsset('ppl-zhuang-fangyi', 'private-extra.png'), null)
    assert.equal(registry.readAsset('ppl-zhuang-fangyi', '../private-extra.png'), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('character artwork registry reports a transparent pending state when approved art is absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-character-artwork-pending-'))
  try {
    const directory = join(root, 'ppl-zhuang-fangyi')
    mkdirSync(directory)
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
      schema: CHARACTER_ARTWORK_SCHEMA,
      characterId: 'ppl-zhuang-fangyi',
      status: 'awaiting-approved-artwork',
      portrait: null,
      expressions: {},
      motion: null,
      attribution: null,
    }))
    const view = new CharacterArtworkRegistry({ root }).get('ppl-zhuang-fangyi')
    assert.equal(view.status, 'awaiting-approved-artwork')
    assert.equal(view.portraitUrl, null)
    assert.deepEqual(view.expressions, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('character artwork registry rejects malformed manifests, path traversal and symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-character-artwork-safe-'))
  try {
    const directory = join(root, 'ppl-zhuang-fangyi')
    mkdirSync(directory)
    const outside = join(root, 'outside.png')
    writeFileSync(outside, Buffer.from([1, 2, 3]))
    symlinkSync(outside, join(directory, 'linked.png'))
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
      schema: CHARACTER_ARTWORK_SCHEMA,
      characterId: 'ppl-zhuang-fangyi',
      status: 'ready',
      portrait: 'linked.png',
      expressions: {},
      motion: null,
      attribution: null,
    }))
    const registry = new CharacterArtworkRegistry({ root })
    assert.equal(registry.get('../deepseek').status, 'missing')
    assert.equal(registry.get('ppl-zhuang-fangyi').portraitUrl, null)
    assert.equal(registry.readAsset('ppl-zhuang-fangyi', 'linked.png'), null)
    writeFileSync(join(directory, 'manifest.json'), '{"schema":"wrong","characterId":"ppl-zhuang-fangyi"}')
    assert.equal(registry.get('ppl-zhuang-fangyi').status, 'missing')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
