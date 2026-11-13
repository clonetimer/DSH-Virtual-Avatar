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
      assert.match(input.system, /日常陪伴对话场景/)
      assert.doesNotMatch(input.system, /Galgame/)
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
    const summaryCandidate = await call(route.handler, { action: 'summary-candidate' })
    assert.equal(summaryCandidate.status, 200)
    assert.equal(summaryCandidate.body.candidate.requiresUserConfirmation, true)
    assert.ok(summaryCandidate.body.candidate.sourceHash)
    const summaryConfirm = await call(route.handler, {
      action: 'summary-confirm',
      args: { summary: summaryCandidate.body.candidate.summary || '主人和鲸鱼娘正在建立长期陪伴关系。', expectedStoryRevision: 0 },
    })
    assert.equal(summaryConfirm.status, 200)
    assert.match(summaryConfirm.body.storyMemory.summary, /今天辛苦了/)
    assert.match(summaryConfirm.body.storyMemory.summary, /主人也辛苦啦/)
    const staleSummaryConfirm = await call(route.handler, {
      action: 'summary-confirm',
      args: { summary: '过期摘要不得覆盖新摘要', expectedStoryRevision: 0 },
    })
    assert.equal(staleSummaryConfirm.status, 409)
    assert.equal(staleSummaryConfirm.body.code, 'REVISION_CONFLICT')
    const historyPage = await call(route.handler, { action: 'history', args: { limit: 1 } })
    assert.equal(historyPage.status, 200)
    assert.equal(historyPage.body.total, 2)
    assert.equal(historyPage.body.lines.length, 1)
    assert.equal(historyPage.body.lines[0].who, 'heroine')
    assert.equal(historyPage.body.nextBefore, 1)


    assert.deepEqual(chat.body.choices, [])

    const memory = await call(route.handler, {
      action: 'memory-add',
      args: { text: '主人喜欢海边的夜景', eventId: 'host-memory-1' },
    })
    assert.equal(memory.status, 200)
    assert.equal(memory.body.view.memories, 1)

    const editedMemory = await call(route.handler, {
      action: 'memory-edit',
      args: { memoryId: memory.body.result.memory.id, text: '主人喜欢海边的夜景，也喜欢安静的海风' },
    })
    assert.equal(editedMemory.status, 200)
    assert.equal(editedMemory.body.memory.text, '主人喜欢海边的夜景，也喜欢安静的海风')
    const invalidMemoryEdit = await call(route.handler, {
      action: 'memory-edit',
      args: { memoryId: memory.body.result.memory.id, text: '   ' },
    })
    assert.equal(invalidMemoryEdit.status, 500)
    const memoryExport = await call(route.handler, { action: 'memory-export' })
    assert.equal(memoryExport.status, 200)
    assert.equal(memoryExport.body.export.schema, 'dsh-virtual-avatar.memories/1')
    assert.equal(memoryExport.body.export.memories[0].text, '主人喜欢海边的夜景，也喜欢安静的海风')

    const profile = await call(route.handler, {
      action: 'profile-set',
      args: { profile: { displayName: '小鲸鱼' } },
    })
    assert.equal(profile.status, 200)
    assert.equal(profile.body.profile.displayName, '小鲸鱼')
    const resetProfile = await call(route.handler, { action: 'profile-set', args: { profile: {} } })
    assert.equal(resetProfile.status, 200)
    assert.equal(resetProfile.body.profile.displayName, '鲸鱼娘')

    const background = await call(route.handler, {
      action: 'background-set',
      args: { background: 'bg-deepseek-seaside-study' },
    })
    assert.equal(background.status, 200)
    assert.match(background.body.view.character.backgroundUrl, /bg-deepseek-seaside-study\.webp$/)
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
    assert.match(result.body.character.imageUrl, /maid-left\.webp$/)
    assert.match(result.body.character.backgroundUrl, /palace-night\.webp$/)
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


test('backup API creates, lists, verifies and restores user data with explicit confirmation', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-backup-api-'))
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
    const plugin = apply(ctx, {})
    const original = await call(route.handler, { action: 'profile-set', args: { profile: { displayName: '备份前的鲸鱼娘' } } })
    assert.equal(original.status, 200)
    const created = await call(route.handler, { action: 'backup-create' })
    assert.equal(created.status, 200)
    const backupId = created.body.backup.id
    assert.match(backupId, /^backup-/)
    const listed = await call(route.handler, { action: 'backup-list' })
    assert.equal(listed.body.backups.length, 1)
    const verified = await call(route.handler, { action: 'backup-verify', args: { backupId } })
    assert.equal(verified.status, 200)
    assert.equal(verified.body.verification.valid, true)
    const changed = await call(route.handler, { action: 'profile-set', args: { profile: { displayName: '备份后的鲸鱼娘' } } })
    assert.equal(changed.status, 200)
    const refused = await call(route.handler, { action: 'backup-restore', args: { backupId } })
    assert.equal(refused.status, 400)
    assert.equal(refused.body.code, 'CONFIRMATION_REQUIRED')
    const restored = await call(route.handler, { action: 'backup-restore', args: { backupId, confirmed: true } })
    assert.equal(restored.status, 200)
    const view = await call(route.handler, { action: 'view' })
    assert.equal(view.body.character.name, '备份前的鲸鱼娘')
    assert.equal(plugin.store.loadCharacterState('deepseek').state.profileOverrides.displayName, '备份前的鲸鱼娘')
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('conversation search and relationship timeline return persisted companion events', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-history-'))
  let route
  let cleanup
  const llm = { stream: async function* () { yield { type: 'text-delta', text: '我会记得这次海边散步。' }; yield { type: 'finish', reason: { kind: 'stop' } } } }
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm,
    dshHomePath: (...segments) => join(home, ...segments),
    inject(names, callback) {
      if (names.includes('agentDefaultModel')) callback({ agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) } })
    },
    effect(fn) { cleanup = fn() },
  }
  try {
    apply(ctx, {})
    const chat = await call(route.handler, { action: 'chat', args: { text: '我们今天去海边散步了。' } })
    assert.equal(chat.status, 200)
    const search = await call(route.handler, { action: 'history-search', args: { query: '海边' } })
    assert.equal(search.status, 200)
    assert.ok(search.body.matches.length >= 1)
    const short = await call(route.handler, { action: 'history-search', args: { query: 'a' } })
    assert.equal(short.status, 400)
    assert.equal(short.body.code, 'SEARCH_QUERY_TOO_SHORT')
    const memoryAdd = await call(route.handler, { action: 'memory-add', args: { text: '主人喜欢海边的夜景', eventId: 'p2-memory-1' } })
    assert.equal(memoryAdd.status, 200)
    const memorySearch = await call(route.handler, { action: 'memory-list', args: { query: '海边', level: 'edge' } })
    assert.equal(memorySearch.status, 200)
    assert.equal(memorySearch.body.memories.length, 1)
    assert.match(memorySearch.body.memories[0].text, /海边/)
    const pinnedMemory = await call(route.handler, { action: 'memory-pin', args: { memoryId: memorySearch.body.memories[0].id, pinned: true } })
    assert.equal(pinnedMemory.status, 200)
    const pinnedFilter = await call(route.handler, { action: 'memory-list', args: { pinned: 'pinned' } })
    assert.equal(pinnedFilter.body.memories.length, 1)
    const events = await call(route.handler, { action: 'relationship-history', args: { limit: 50 } })
    assert.equal(events.status, 200)
    const growthEvent = events.body.events.find(event => event.type === 'TURN_COMPLETED')
    assert.ok(growthEvent)
    assert.equal(growthEvent.label, '完成一次陪伴对话')
    assert.equal(typeof growthEvent.details.affectionBefore, 'number')
    assert.equal(typeof growthEvent.details.affectionAfter, 'number')
    assert.equal(typeof growthEvent.details.trustBefore, 'number')
    assert.equal(typeof growthEvent.details.attachmentAfter, 'number')
    assert.equal(typeof growthEvent.details.stageChanged, 'boolean')
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('runtime diagnostics reports model PPL storage and companion health without credentials', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-diagnostics-'))
  let route
  let cleanup
  const llm = {
    listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek', available: true, apiKey: 'sk-secret-must-not-leak' }],
    stream: async function* () { yield { type: 'text-delta', text: '你好' }; yield { type: 'finish', reason: { kind: 'stop' } } },
  }
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm,
    dshHomePath: (...segments) => join(home, ...segments),
    inject(names, callback) {
      if (names.includes('agentDefaultModel')) callback({ agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) } })
    },
    effect(fn) { cleanup = fn() },
  }
  try {
    apply(ctx, {})
    const modelTest = await call(route.handler, { action: 'model-test' })
    assert.equal(modelTest.status, 200)
    assert.equal(modelTest.body.test.status, 'success')
    const result = await call(route.handler, { action: 'diagnostics' })
    assert.equal(result.status, 200)
    const d = result.body.diagnostics
    assert.equal(d.model.status, 'selected')
    assert.equal(d.model.selected.provider, 'deepseek-official')
    assert.equal(d.persona.runtime, 'loaded')
    assert.equal(d.persona.ir.status, 'valid')
    assert.equal(d.storage.database.status, 'available')
    assert.equal(typeof d.storage.memoryCount, 'number')
    assert.equal(d.companion.relationshipStage, 'acquaintance')
    assert.ok(!JSON.stringify(d).includes('sk-secret-must-not-leak'))
    assert.ok(!JSON.stringify(d).toLowerCase().includes('apikey'))
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('host plugin lifecycle disposes its route once and preserves DSH_HOME data across reload', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-lifecycle-'))
  let route = null
  let disposeCount = 0
  let cleanup = null
  const makeContext = () => ({
    webServer: {
      register(value) {
        assert.equal(route, null, 'only one companion route may be registered')
        route = value
        return () => { disposeCount++; route = null }
      },
    },
    llm: { stream: async function* () { yield { type: 'text-delta', text: '你好' }; yield { type: 'finish', reason: { kind: 'stop' } } } },
    dshHomePath: (...segments) => join(home, ...segments),
    inject() {},
    effect(fn) { cleanup = fn() },
  })
  try {
    const first = apply(makeContext(), {})
    const saved = await call(route.handler, { action: 'profile-set', args: { profile: { displayName: '持久化鲸鱼娘' } } })
    assert.equal(saved.status, 200)
    cleanup()
    assert.equal(route, null)
    assert.equal(disposeCount, 1)
    const second = apply(makeContext(), {})
    assert.ok(route)
    const view = await call(route.handler, { action: 'view' })
    assert.equal(view.status, 200)
    assert.equal(view.body.character.name, '持久化鲸鱼娘')
    cleanup()
    assert.equal(route, null)
    assert.equal(disposeCount, 2)
    assert.notEqual(first.store, second.store)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('PPL emotion state drives the Whale portrait across completed turns', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-presentation-'))
  let route
  let cleanup
  const llm = {
    stream: async function* () {
      yield { type: 'text-delta', text: '你好呀，主人。' }
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
    apply(ctx, {})
    const initial = await call(route.handler, { action: 'view' })
    assert.equal(initial.body.character.presentation.expression, 'neutral')
    assert.equal(initial.body.character.presentation.expressionSource, 'baseline')
    assert.match(initial.body.character.imageUrl, /maid-left\.webp$/)

    for (let index = 0; index < 8; index++) {
      const turn = await call(route.handler, {
        action: 'chat',
        args: {
          text: '你真可爱',
          eventId: 'presentation-praise-' + index,
          sessionId: 'presentation-session',
        },
      })
      assert.equal(turn.status, 200)
    }

    const afterPraise = await call(route.handler, { action: 'view' })
    assert.ok(afterPraise.body.character.pplState.embarrassment >= 0.70)
    assert.equal(afterPraise.body.character.presentation.expression, 'shy')
    assert.equal(afterPraise.body.character.presentation.expressionSource, 'ppl-state')
    assert.match(afterPraise.body.character.imageUrl, /whale-shy\.webp$/)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('native DyberPet folder metadata validates without mutating the Whale profile', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-motion-preview-'))
  let route
  let cleanup
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm: { stream: async function* () { yield { type: 'text-delta', text: '你好' }; yield { type: 'finish', reason: { kind: 'stop' } } } },
    dshHomePath: (...segments) => join(home, ...segments),
    inject() {},
    effect(fn) { cleanup = fn() },
  }
  try {
    apply(ctx, {})
    const initial = await call(route.handler, { action: 'view' })
    const preview = await call(route.handler, {
      action: 'motion-preview-validate',
      args: {
        petConfig: { default: 'idle', random_act: [] },
        actConfig: { idle: { images: 'stand', act_num: 2, frame_refresh: 0.15 } },
        frameFiles: ['action/stand_1.png', 'action/stand_0.png'],
      },
    })
    assert.equal(preview.status, 200)
    assert.equal(preview.body.ok, true)
    assert.equal(preview.body.previewOnly, true)
    assert.equal(preview.body.persistent, false)
    assert.deepEqual(preview.body.catalog.actions.idle.frames, ['action/stand_0.png', 'action/stand_1.png'])
    assert.equal(preview.body.catalog.actions.idle.durationMs, 600)

    const malformed = await call(route.handler, {
      action: 'motion-preview-validate',
      args: {
        petConfig: { default: 'idle' },
        actConfig: { idle: { images: 'stand' } },
        frameFiles: ['../unsafe.png'],
      },
    })
    assert.equal(malformed.status, 400)
    assert.match(malformed.body.code, /^DYBERPET_/)

    const after = await call(route.handler, { action: 'view' })
    assert.deepEqual(after.body.character.chatLines, initial.body.character.chatLines)
    assert.equal(after.body.character.imageUrl, initial.body.character.imageUrl)
    assert.equal(after.body.revision, initial.body.revision)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})
