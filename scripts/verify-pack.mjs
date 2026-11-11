import assert from 'node:assert/strict'

let input = ''
for await (const chunk of process.stdin) input += chunk
const result = JSON.parse(input)
assert.ok(Array.isArray(result) && result.length === 1, 'npm pack must return exactly one package result')
const files = new Set(result[0].files.map(file => file.path))
const required = [
  'package.json',
  'lib/index.js',
  'lib/client.js',
  'src/host/plugin.mjs',
  'src/storage/sqlite-store.mjs',
  'src/characters/deepseek-whale/service.mjs',
  'personas/deepseek-whale.ppl',
  'personas/deepseek-whale.pir.json',
  'assets/deepseek-whale/maid-left.webp',
  'assets/deepseek-whale/palace-night.webp',
  'cordis.patch.yml',
  'README.md',
]
for (const path of required) assert.ok(files.has(path), 'package is missing required file: ' + path)
for (const path of files) {
  assert.ok(!path.startsWith('.github/'), 'CI internals must not be shipped: ' + path)
  assert.ok(!path.startsWith('test/'), 'test sources must not be shipped: ' + path)
  assert.ok(!path.startsWith('.ppl-toolchain/'), 'PPL compiler checkout must not be shipped: ' + path)
  assert.ok(!path.includes('.sqlite') && !path.includes('.db'), 'runtime user data must not be shipped: ' + path)
}
const totalBytes = result[0].size
assert.ok(totalBytes > 0, 'package archive must not be empty')
process.stdout.write(JSON.stringify({ name: result[0].name, version: result[0].version, fileCount: files.size, archiveBytes: totalBytes, requiredFiles: required.length }, null, 2) + '\n')
