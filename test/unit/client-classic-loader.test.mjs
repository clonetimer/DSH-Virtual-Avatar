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
  assert.match(artifact, /互动场合/)
  assert.match(artifact, /鲸鱼娘现在的状态/)
  assert.match(artifact, /更多 ▾/)
  assert.match(artifact, /dva-more-menu/)
  assert.match(artifact, /dva-utility-overlay/)
  assert.match(artifact, /event.key !== 'Escape'/)
  assert.match(artifact, /关闭搜索/)
  assert.match(artifact, /亲近度/)
  assert.match(artifact, /关闭搜索/)
  assert.match(artifact, /dva-menu-group/)
    assert.match(artifact, /grid-template-rows:minmax\(0,1fr\)/)
  assert.match(artifact, /grid-template-rows:auto minmax\(0,1fr\)/)
    assert.match(artifact, /\.dva-input\{display:flex;flex:0 0 auto/)
    assert.match(artifact, /dva-avatar-stage is-/)
    assert.match(artifact, /@keyframes dva-avatar-idle/)
    assert.match(artifact, /@keyframes dva-avatar-thinking/)
    assert.match(artifact, /@keyframes dva-avatar-response/)
    assert.match(artifact, /正在思考…/)
    assert.match(artifact, /不知道聊什么？可以从这里开始/)
    assert.match(artifact, /输入消息，按 Enter 发送…/)
    assert.match(artifact, /prefers-reduced-motion:reduce/)
  assert.match(artifact, /心情 · /)
  assert.match(artifact, /害羞 · /)
  assert.doesNotMatch(artifact, /精力 · /)
  assert.match(artifact, /setText\(current => current === clean \? '' : current\)/)
  assert.doesNotMatch(artifact, /互动环境 · PPL 场景/)
  assert.doesNotMatch(artifact, /角色状态 · PPL/)
  assert.doesNotMatch(source, /setShowHistorySearch|setShowDiagnostics|setShowBackups/)
    assert.match(artifact, /返回聊天/)
    assert.match(artifact, /aria-label: '返回聊天'/)
    assert.match(artifact, /onClick: closeUtilityPanel/)
    assert.match(artifact, /openUtilityPanel\('memories'\); void loadMemories\(\)/)
    assert.match(artifact, /dva-memory-toolbar/)
    assert.match(artifact, /点击立绘，可以摸摸鲸鱼娘/)
    assert.match(artifact, /嘿嘿，主人摸摸我啦～/)
    assert.match(artifact, /dva-avatar-stage is-patting img/)
    assert.match(artifact, /@keyframes dva-avatar-pat/)
    assert.match(artifact, /avatarMotion !== 'patting'/)
    assert.match(artifact, /setAvatarExpressionOverride\('shy'\)/)
    const memoryLoader = source.slice(source.indexOf('const loadMemories = async'), source.indexOf('\n\n  if (!open)'))
    assert.ok(memoryLoader.startsWith('const loadMemories = async'), 'memory loader must remain present')
    assert.doesNotMatch(memoryLoader, /setActivePanel|openUtilityPanel/, 'memory fetch completion must not reopen a closed panel')
  assert.match(artifact, /shell\.overlay/)
})
