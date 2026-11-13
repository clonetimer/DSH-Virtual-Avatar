import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const root = process.cwd()
const toolchainRoot = resolve(process.argv[2] || '.ppl-toolchain')
const manifestPath = resolve(root, 'docs/ppl-reference/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const expectedCommit = manifest.upstream.commit
const actualCommit = execFileSync('git', ['-C', toolchainRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert.equal(actualCommit, expectedCommit, 'PPL toolchain checkout must match the pinned upstream commit')

const coreRoot = resolve(toolchainRoot, manifest.upstream.corePath)
const runtimeRoot = resolve(toolchainRoot, manifest.upstream.runtimePath)
const corePackage = JSON.parse(readFileSync(resolve(coreRoot, 'package.json'), 'utf8'))
assert.equal(corePackage.version, manifest.upstream.coreVersion, 'PPL Core version must match the integration manifest')

const fsProjectUrl = pathToFileURL(resolve(coreRoot, 'dist/src/fs-project.js')).href
const { compileFile } = await import(fsProjectUrl)
const sourcePath = manifest.persona.source
const moduleRoot = relative(root, resolve(coreRoot, 'modules'))
const compiled = compileFile(sourcePath, { moduleRoot })
const errors = (compiled.diagnostics || []).filter(item => item.severity === 'error')
assert.equal(errors.length, 0, 'PPL source must compile without errors: ' + JSON.stringify(errors, null, 2))
assert.ok(compiled.ir, 'PPL compiler must produce a Persona IR')
assert.equal(compiled.ir.schema, manifest.persona.schema)
assert.equal(compiled.ir.persona?.id, manifest.persona.id)

const checkedInIr = JSON.parse(readFileSync(resolve(root, manifest.persona.compiled), 'utf8'))
const compiledArtifact = JSON.parse(JSON.stringify(compiled.ir))
assert.ok(
  isDeepStrictEqual(compiledArtifact, checkedInIr),
  'checked-in Persona IR is stale; regenerate it with the pinned PPL compiler and commit both source and IR',
)

const referencePersonaResults = []
for (const item of manifest.referencePersonas || []) {
  const sourceBytes = readFileSync(resolve(root, item.source))
  const upstreamSourceBytes = readFileSync(resolve(toolchainRoot, item.upstreamSource))
  assert.ok(sourceBytes.equals(upstreamSourceBytes), 'reference PPL source differs from pinned upstream: ' + item.id)
  const irBytes = readFileSync(resolve(root, item.compiled))
  const upstreamIrBytes = readFileSync(resolve(toolchainRoot, item.upstreamCompiled))
  assert.ok(irBytes.equals(upstreamIrBytes), 'reference Persona IR differs from pinned upstream: ' + item.id)
  const result = compileFile(item.source, { moduleRoot })
  const errors = (result.diagnostics || []).filter(d => d.severity === 'error')
  assert.equal(errors.length, 0, 'reference Persona source did not compile: ' + item.id + ' ' + JSON.stringify(errors))
  assert.ok(result.ir, 'reference Persona source has no IR: ' + item.id)
  assert.equal(result.ir.persona.id, item.id)
  const generated = JSON.parse(JSON.stringify(result.ir))
  const checked = JSON.parse(irBytes.toString('utf8'))
  // The upstream maintained DH adapter reference IR is intentionally an independent
  // release artifact. It may differ from a fresh example-source compiler output.
  // Require both to be valid, and byte-check each against its pinned upstream
  // counterpart; report rather than erase any cross-artifact drift.
  referencePersonaResults.push({
    id: item.id,
    rules: checked.rules.length,
    scenes: Object.keys(checked.scenes || {}).length,
    sourceCompiles: true,
    matchesFreshCompilerOutput: isDeepStrictEqual(generated, checked),
  })
}

const runtimeResults = []
for (const item of manifest.runtimeMirrors) {
  const pluginBytes = readFileSync(resolve(root, item.plugin))
  const upstreamBytes = readFileSync(resolve(runtimeRoot, item.upstream.replace(manifest.upstream.runtimePath + '/', '')))
  assert.ok(
    pluginBytes.equals(upstreamBytes),
    'vendored PPL runtime mirror differs from pinned upstream: ' + item.plugin,
  )
  runtimeResults.push(item.plugin)
}

const referenceResults = []
for (const item of manifest.referenceCopies) {
  const pluginBytes = readFileSync(resolve(root, item.plugin))
  const upstreamPath = item.upstream.startsWith(manifest.upstream.corePath + '/')
    ? resolve(toolchainRoot, item.upstream)
    : resolve(runtimeRoot, item.upstream.replace(manifest.upstream.runtimePath + '/', ''))
  const upstreamBytes = readFileSync(upstreamPath)
  assert.ok(
    pluginBytes.equals(upstreamBytes),
    'frozen PPL reference copy differs from pinned upstream: ' + item.plugin,
  )
  referenceResults.push(item.plugin)
}

const adapter = readFileSync(resolve(root, manifest.adapter.plugin), 'utf8')
assert.ok(adapter.includes('materialize(runtime, context = {}, scene = this.scene)'), 'plugin PPL adapter must retain the documented per-turn scene extension')
assert.ok(adapter.includes('input.scene ?? this.scene'), 'plugin PPL adapter must pass the current turn scene to the upstream runtime')

console.log(JSON.stringify({
  ok: true,
  upstream: manifest.upstream.repository + '@' + actualCommit,
  coreVersion: corePackage.version,
  persona: manifest.persona.id,
  irSchema: checkedInIr.schema,
  rules: checkedInIr.rules.length,
  transitions: checkedInIr.transitions.length,
  referencePersonas: referencePersonaResults,
  runtimeMirrors: runtimeResults,
  referenceCopies: referenceResults,
  adapterExtension: manifest.adapter.extension,
}, null, 2))
