import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../../src/host/plugin.mjs'

function request(body, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')])
  req.method = 'POST'
  req.headers = headers
  return req
}

async function call(handler, body) {
  let status = 0
  let raw = ''
  const res = {
    writeHead(value) { status = value },
    end(value) { raw = value },
  }
  await handler(request(body), res)
  return { status, body: JSON.parse(raw) }
}

test('DSH host plugin serves one DeepSeek Whale companion and commits completed turns', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-host-'))
  let route
  let cleanup
  const llm = {
    stream: async function* (input) {
      assert.equal(input.provider, 'deepseek-official')
      assert.equal(input.model, 'deepseek-v4-flash')
      if (!input.system.includes('生成三个自然')) assert.match(input.system, /DeepSeek 鲸鱼娘/)
      yield { type: 'text-delta', text: '主人也辛苦啦，我一直在这里哦。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
      if (input.system.includes('生成三个自然')) {
        yield { type: 'text-delta', text: '[{"text":"再聊一会儿","effect":0},{"text":"给她一个拥抱","effect":1},{"text":"让她休息","effect":-1}]' }
      }
    },
  }
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm,
    dshHomePath: (...segments) => join(home, ...segments),
    inject(names, callback) {
      if (names.includes('agentDefaultModel')) {
        callback({ agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) } })
      }
    },
    effect(fn) { cleanup = fn() },
  }
  try {
    const plugin = apply(ctx, {})
    assert.equal(plugin.apiPath, '/api/dsh-virtual-avatar')
    assert.equal(route.path, '/api/dsh-virtual-avatar')

    const view = await call(route.handler, { action: 'view' })
    assert.equal(view.status, 200)
    assert.equal(view.body.character.id, 'deepseek')
    assert.equal(view.body.character.level, 1)

    const chat = await call(route.handler, {
      action: 'chat',
      args: { text: '今天辛苦了', eventId: 'host-turn-1', sessionId: 'test-session' },
    })
    assert.equal(chat.status, 200)
    assert.equal(chat.body.ok, true)
    assert.equal(chat.body.reply, '主人也辛苦啦，我一直在这里哦。')
    assert.equal(chat.body.view.character.relationship.trust, 0.51)
    assert.equal(chat.body.view.character.chatLines.length, 2)
    const historyPage = await call(route.handler, { action: 'history', args: { limit: 1 } })
    assert.equal(historyPage.status, 200)
    assert.equal(historyPage.body.total, 2)
    assert.equal(historyPage.body.lines.length, 1)
    assert.equal(historyPage.body.lines[0].who, 'heroine')
    assert.equal(historyPage.body.nextBefore, 1)

    const history = await call(route.handler, { action: 'history', args: { limit: 1 } })
    assert.equal(history.status, 200)
    assert.equal(history.body.total, 2)
    assert.equal(history.body.lines.length, 1)
    assert.equal(history.body.lines[0].who, 'heroine')
    assert.equal(history.body.nextBefore, 1)

    assert.equal(chat.body.choices.length, 3)
    assert.deepEqual(chat.body.choices.map(item => item.effect).sort(), [-1, 0, 1])
    assert.deepEqual(chat.body.choices.map(item => item.text), ['再聊一会儿', '给她一个拥抱', '让她休息'])

    const memory = await call(route.handler, {
      action: 'memory-add',
      args: { text: '主人喜欢海边的夜景', eventId: 'host-memory-1' },
    })
    assert.equal(memory.status, 200)
    assert.equal(memory.body.view.memories, 1)

    const profile = await call(route.handler, {
      action: 'profile-set',
      args: { profile: { displayName: '小鲸鱼' } },
    })
    assert.equal(profile.status, 200)
    assert.equal(profile.body.profile.displayName, '小鲸鱼')

    const background = await call(route.handler, {
      action: 'background-set',
      args: { background: 'bg-deepseek-seaside-study' },
    })
    assert.equal(background.status, 200)
    assert.match(background.body.view.character.backgroundUrl, /bg-deepseek-seaside-study\\.webp$/)
    const invalidBackground = await call(route.handler, {
      action: 'background-set',
      args: { background: '../outside' },
    })
    assert.equal(invalidBackground.status, 400)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('DeepSeek Whale view exposes a character-art launcher asset', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-pet-'))
  let route
  let cleanup
  const llm = { stream: async function* () { yield { type: 'text-delta', text: '你好' }; yield { type: 'finish', reason: { kind: 'stop' } } } }
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm,
    dshHomePath: (...segments) => join(home, ...segments),
    inject() {},
    effect(fn) { cleanup = fn() },
  }
  try {
    apply(ctx, {})
    const result = await call(route.handler, { action: 'view' })
    assert.match(result.body.character.imageUrl, /maid-left\\.webp$/)
    assert.match(result.body.character.backgroundUrl, /palace-night\\.webp$/)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

test('DSH companion API rejects cross-site and mismatched Origin requests', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-origin-'))
  let route
  let cleanup
  const llm = { stream: async function* () { yield { type: 'text-delta', text: '你好' }; yield { type: 'finish', reason: { kind: 'stop' } } } }
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm,
    dshHomePath: (...segments) => join(home, ...segments),
    inject() {},
    effect(fn) { cleanup = fn() },
  }
  try {
    apply(ctx, {})
    const invoke = async headers => {
      let status = 0
      let raw = ''
      await route.handler(request({ action: 'view' }, headers), {
        writeHead(value) { status = value },
        end(value) { raw = value },
      })
      return { status, body: JSON.parse(raw) }
    }
    const crossSite = await invoke({ host: 'localhost', 'sec-fetch-site': 'cross-site' })
    assert.equal(crossSite.status, 403)
    assert.equal(crossSite.body.code, 'CROSS_SITE_REQUEST')
    const wrongOrigin = await invoke({ host: 'localhost', origin: 'https://evil.example' })
    assert.equal(wrongOrigin.status, 403)
    assert.equal(wrongOrigin.body.code, 'ORIGIN_MISMATCH')
    const sameOrigin = await invoke({ host: 'localhost', origin: 'http://localhost' })
    assert.equal(sameOrigin.status, 200)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})
