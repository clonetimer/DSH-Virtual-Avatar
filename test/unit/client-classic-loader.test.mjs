import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Script } from 'node:vm'

const clientPath = new URL('../../lib/client.js', import.meta.url)
const sourcePath = new URL('../../src/client/companion.mjs', import.meta.url)

/**
 * The real DSH 0.2.2-rc.1 Web/Desktop client loader executes a classic
 * <script>, not an ESM script. Node --check of an ESM package misses this.
 */
test('client artifact executes as a classic DSH script and registers a factory', () => {
  const artifact = readFileSync(clientPath, 'utf8')
  const script = new Script(artifact, { filename: 'lib/client.js' })
  const registrations = []
  script.runInNewContext({
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
  }, { timeout: 3000 })

  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].id, 'dsh-virtual-avatar')
  assert.equal(typeof registrations[0].factory, 'function')
  const requested = []
  const modules = {
    react: { default: { useCallback() {}, useEffect() {}, useState() {} } },
    'react-dom/client': { createRoot() {} },
  }
  const exports = registrations[0].factory(spec => {
    requested.push(spec)
    assert.ok(Object.hasOwn(modules, spec), 'unexpected external module ' + spec)
    return modules[spec]
  })

  assert.deepEqual(requested, ['react', 'react-dom/client'])
  assert.equal(exports.name, 'dsh-virtual-avatar-client')
  assert.equal(typeof exports.apply, 'function')
  assert.equal(Array.from(exports.inject).join(','), 'slots')
})

test('built client preserves companion features without bundling its own React', () => {
  const source = readFileSync(sourcePath, 'utf8')
  const artifact = readFileSync(clientPath, 'utf8')
  assert.match(source, /import React/)
  assert.doesNotMatch(artifact, /^import /m)
  assert.doesNotMatch(artifact, /^export /m)
  assert.match(artifact, /window\.__ModuleLoader__\.load\(/)
  assert.match(artifact, /memory-export/)
  assert.match(artifact, /model-test/)
  assert.match(artifact, /scene-set/)
  assert.match(artifact, /PRIVATE_HOME/)
  assert.match(artifact, /PUBLIC_SPACE/)
  assert.match(artifact, /互动环境 · PPL 场景/)
  assert.match(artifact, /shell\.overlay/)
})
