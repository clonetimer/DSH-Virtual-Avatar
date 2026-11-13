import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../../src/host/plugin.mjs'

async function call(handler, action, args = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify({ action, args }), 'utf8')])
  req.method = 'POST'
  req.headers = {}
  let status = 0
  let response = ''
  await handler(req, {
    writeHead(code) { status = code },
    end(value) { response = String(value || '') },
  })
  return { status, body: JSON.parse(response) }
}

test('P5-C2 DSH Host supports role selection and isolated PPL-native chat without Whale artwork', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-ppl-multirole-'))
  let route
  let cleanup
  const invocations = []
  const llm = {
    listProviders() { return [{ id: 'deepseek-official', name: 'DeepSeek' }] },
    async listModels() { return [{ id: 'deepseek-v4-flash', name: 'DeepSeek Flash' }] },
    stream: async function* (input) {
      assert.equal(input.provider, 'deepseek-official')
      assert.equal(input.model, 'deepseek-v4-flash')
      if (input.system === 'This is a connectivity test. Reply with OK only.') {
        yield { type: 'text-delta', text: 'OK' }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      invocations.push(input)
      assert.match(input.system, /庄方宜/)
      assert.doesNotMatch(input.system, /你正在 DeepSeek 鲸鱼娘/)
      assert.match(input.messages[0].content[0].text, /独立 PPL 角色陪伴对话/)
      yield { type: 'text-delta', text: '谢谢。我会注意休息。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm,
    dshHomePath: (...segments) => join(home, ...segments),
    inject(names, callback) {
      if (names.includes('agentDefaultModel')) callback({
        agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) },
      })
    },
    effect(fn) { cleanup = fn() },
  }

  try {
    apply(ctx, {})
    const list = await call(route.handler, 'character-list')
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.roles.map(x => x.characterId), ['deepseek', 'ppl-zhuang-fangyi'])
    assert.equal(list.body.active.characterId, 'deepseek')
    const invalid = await call(route.handler, 'character-select', { characterId: 'missing' })
    assert.equal(invalid.status, 404)
    const selected = await call(route.handler, 'character-select', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(selected.status, 200)
    assert.equal(selected.body.active.characterId, 'ppl-zhuang-fangyi')
    const alt = await call(route.handler, 'character-view', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(alt.status, 200)
    assert.equal(alt.body.character.kind, 'ppl-reference')
    assert.equal(alt.body.character.hasDedicatedArtwork, false)
    assert.equal(alt.body.character.name, '庄方宜 · PPL 参考角色')
    assert.equal(alt.body.character.chatLines.length, 0)
    assert.equal(alt.body.character.interactionScene, 'PRIVATE_NIGHT')

    const chat = await call(route.handler, 'character-chat', {
      characterId: 'ppl-zhuang-fangyi', text: '你辛苦了', eventId: 'zhuang-host-turn-1',
    })
    assert.equal(chat.status, 200, chat.body?.error)
    assert.equal(chat.body.view.character.chatLines.length, 2)
    assert.equal(chat.body.view.character.relationship.trust, 0.87)
    assert.equal(invocations.length, 1)
    const same = await call(route.handler, 'character-chat', {
      characterId: 'ppl-zhuang-fangyi', text: '你辛苦了', eventId: 'zhuang-host-turn-1',
    })
    assert.equal(same.status, 200)
    assert.equal(same.body.duplicate, true)
    assert.equal(invocations.length, 1)
    const conflict = await call(route.handler, 'character-chat', {
      characterId: 'ppl-zhuang-fangyi', text: '不同内容', eventId: 'zhuang-host-turn-1',
    })
    assert.equal(conflict.status, 409)
    assert.equal(conflict.body.code, 'EVENT_ID_CONFLICT')

    const store = await call(route.handler, 'character-memory-add', {
      characterId: 'ppl-zhuang-fangyi', text: '庄方宜的私人记忆', eventId: 'zhuang-host-memory-1',
    })
    assert.equal(store.status, 200)
    const id = store.body.result.memory.id
    const memories = await call(route.handler, 'character-memory-list', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(memories.body.memories.length, 1)
    const whaleMemories = await call(route.handler, 'memory-list')
    assert.equal(whaleMemories.body.memories.length, 0)
    const whaleMutation = await call(route.handler, 'memory-pin', { memoryId: id })
    assert.equal(whaleMutation.status, 404)
    const wrongRole = await call(route.handler, 'character-memory-list', { characterId: 'deepseek' })
    assert.equal(wrongRole.status, 400)
    assert.equal(wrongRole.body.code, 'CHARACTER_ROUTE_MISMATCH')

    const modelGet = await call(route.handler, 'character-model-catalog', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(modelGet.status, 200)
    const modelSet = await call(route.handler, 'character-model-set', {
      characterId: 'ppl-zhuang-fangyi', provider: 'deepseek-official', model: 'deepseek-v4-flash',
    })
    assert.equal(modelSet.status, 200)
    const modelGetAfter = await call(route.handler, 'character-model-catalog', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(modelGetAfter.body.savedSelection.characterId, 'ppl-zhuang-fangyi')
    const whaleModel = await call(route.handler, 'model-catalog')
    assert.equal(whaleModel.body.savedSelection, null)
    const roleModelTest = await call(route.handler, 'character-model-test', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(roleModelTest.status, 200)
    assert.equal(roleModelTest.body.test.status, 'success')
    assert.equal(roleModelTest.body.test.model, 'deepseek-v4-flash')
    assert.equal(invocations.length, 1, 'connectivity test must not create a companion chat turn')

    const beforeConfiguration = await call(route.handler, 'character-config-get', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(beforeConfiguration.status, 200)
    const config = await call(route.handler, 'character-config-set', {
      characterId: 'ppl-zhuang-fangyi',
      configuration: { style: { formality: 0.75 } },
      expectedRevision: beforeConfiguration.body.configuration.revision,
    })
    assert.equal(config.status, 200, config.body?.error)
    assert.equal(config.body.configuration.effective.style.formality, 0.75)
    const audit = await call(route.handler, 'character-audit-history', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(audit.status, 200)
    assert.ok(audit.body.events.some(item => item.type === 'TURN_COMPLETED'))
    assert.ok(audit.body.events.some(item => item.type === 'PPL_CONFIGURATION_UPDATED'))

    const whaleView = await call(route.handler, 'view')
    assert.equal(whaleView.body.character.id, 'deepseek')
    assert.equal(whaleView.body.character.chatLines.length, 0)
    assert.equal(whaleView.body.memories, 0)
    const selectedWhale = await call(route.handler, 'character-select', { characterId: 'deepseek' })
    assert.equal(selectedWhale.body.active.characterId, 'deepseek')
    const zhuangStill = await call(route.handler, 'character-view', { characterId: 'ppl-zhuang-fangyi' })
    assert.equal(zhuangStill.body.character.chatLines.length, 2)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})
