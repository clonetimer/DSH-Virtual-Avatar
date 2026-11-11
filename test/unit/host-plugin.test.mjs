import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../../src/host/plugin.mjs'

function request(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')])
  req.method = 'POST'
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
      assert.match(input.system, /DeepSeek 鲸鱼娘/)
      yield { type: 'text-delta', text: '主人也辛苦啦，我一直在这里哦。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
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
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})
