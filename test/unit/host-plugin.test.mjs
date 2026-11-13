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

async function callRaw(handler, url, bytes, headers = {}) {
  let status = 0
  let raw = ''
  let responseHeaders = {}
  const req = Readable.from([Buffer.from(bytes)])
  req.method = 'POST'
  req.url = url
  req.headers = headers
  const res = {
    writeHead(value, valueHeaders = {}) { status = value; responseHeaders = valueHeaders },
    end(value) { raw = value },
  }
  await handler(req, res)
  return { status, body: raw ? JSON.parse(String(raw)) : null, headers: responseHeaders }
}

async function callGet(handler, url) {
  let status = 0
  let raw = Buffer.alloc(0)
  let responseHeaders = {}
  const req = Readable.from([])
  req.method = 'GET'
  req.url = url
  req.headers = {}
  const res = {
    writeHead(value, valueHeaders = {}) { status = value; responseHeaders = valueHeaders },
    end(value) { raw = Buffer.isBuffer(value) ? value : Buffer.from(value || '') },
  }
  await handler(req, res)
  return { status, body: raw, headers: responseHeaders }
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
    const pplAuditHistory = await call(route.handler, { action: 'ppl-audit-history', args: { limit: 10 } })
    assert.equal(pplAuditHistory.status, 200)
    assert.equal(pplAuditHistory.body.schema, 'ppl.execution-audit/0.1')
    const committedPplAudit = pplAuditHistory.body.events.find(item => item.sourceEventId === 'host-turn-1')
    assert.ok(committedPplAudit)
    assert.equal(committedPplAudit.status, 'committed')
    assert.equal(committedPplAudit.ppl.schema, 'ppl.execution-audit/0.1')
    assert.match(committedPplAudit.ppl.snapshotSha256, /^[0-9a-f]{64}$/u)
    assert.match(committedPplAudit.ppl.persona.irSha256, /^[0-9a-f]{64}$/u)
    assert.ok(committedPplAudit.ppl.resolution.activeRules.some(item => item.id === 'MASTER_COMFORT_TRUST'))
    assert.ok(committedPplAudit.ppl.resolution.invariants.some(item => item.id === 'CORE_TONE' && item.passed))
    assert.ok(committedPplAudit.ppl.state.changes.some(item => item.path === 'relationships.admin.trust'))
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

    const pplConfigGet = await call(route.handler, { action: 'ppl-config-get' })
    assert.equal(pplConfigGet.status, 200)
    assert.equal(pplConfigGet.body.configuration.schema, 'dsh-virtual-avatar.ppl-config/1')
    assert.equal(pplConfigGet.body.configuration.effective.traits.warmth, 0.78)
    const pplConfigPreview = await call(route.handler, {
      action: 'ppl-config-preview',
      args: { configuration: { traits: { warmth: 0.9, playfulness: 0.86 }, style: { verbosity: 0.5 } } },
    })
    assert.equal(pplConfigPreview.status, 200)
    assert.equal(pplConfigPreview.body.preview.valid, true)
    assert.ok(pplConfigPreview.body.preview.scenarios.some(item => item.id === 'public-space' && item.activeRules.includes('PUBLIC_RESTRAINT')))
    const pplConfigSet = await call(route.handler, {
      action: 'ppl-config-set',
      args: {
        expectedRevision: pplConfigGet.body.configuration.revision,
        configuration: { traits: { warmth: 0.9, playfulness: 0.86 }, style: { verbosity: 0.5 } },
      },
    })
    assert.equal(pplConfigSet.status, 200)
    assert.equal(pplConfigSet.body.configuration.effective.traits.warmth, 0.9)
    const pplAuditAfterConfiguration = await call(route.handler, { action: 'ppl-audit-history', args: { limit: 20 } })
    assert.equal(pplAuditAfterConfiguration.status, 200)
    assert.ok(pplAuditAfterConfiguration.body.events.some(item => item.status === 'configuration' && item.ppl.configuration.changes.some(change => change.key === 'warmth')))
    const invalidPplConfig = await call(route.handler, {
      action: 'ppl-config-set',
      args: { configuration: { traits: { warmth: 0.59 } } },
    })
    assert.equal(invalidPplConfig.status, 400)
    assert.equal(invalidPplConfig.body.code, 'PPL_CONFIGURATION_VALUE_OUT_OF_RANGE')
    const pplConfigReset = await call(route.handler, {
      action: 'ppl-config-reset',
      args: { expectedRevision: pplConfigSet.body.revision },
    })
    assert.equal(pplConfigReset.status, 200)
    assert.equal(pplConfigReset.body.configuration.effective.traits.warmth, 0.78)

    const background = await call(route.handler, {
      action: 'background-set',
      args: { background: 'bg-deepseek-seaside-study', overlay: 0.24 },
    })
    assert.equal(background.status, 200)
    assert.match(background.body.view.character.backgroundUrl, /bg-deepseek-seaside-study\.webp$/)
    assert.equal(background.body.view.character.backgroundOverlay, 0.24)
    const invalidBackground = await call(route.handler, {
      action: 'background-set',
      args: { background: '../outside' },
    })
    assert.equal(invalidBackground.status, 400)
    const invalidOverlay = await call(route.handler, {
      action: 'background-set',
      args: { background: 'palace-night', overlay: 0.9 },
    })
    assert.equal(invalidOverlay.status, 400)
    assert.equal(invalidOverlay.body.code, 'BACKGROUND_OVERLAY_INVALID')
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


test('DyberPet motion pack upload persists verified PNG frames, supports preview reads and explicit uninstall', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-motion-host-'))
  let route
  let cleanup
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm: { stream: async function* () { yield { type: 'text-delta', text: '你好' }; yield { type: 'finish', reason: { kind: 'stop' } } } },
    dshHomePath: (...segments) => join(home, ...segments),
    inject() {},
    effect(fn) { cleanup = fn() },
  }
  const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4])
  const petConfig = { default: 'idle', patpat: 'pat' }
  const actConfig = {
    idle: { images: 'stand', act_num: 1, frame_refresh: 0.2 },
    pat: { images: 'pat', act_num: 2, frame_refresh: 0.1 },
  }
  const frameFiles = ['action/stand_0.png', 'action/pat_0.png']
  try {
    const plugin = apply(ctx, {})
    const before = await call(route.handler, { action: 'view' })
    const begin = await call(route.handler, {
      action: 'motion-pack-begin',
      args: { displayName: 'Whale Gesture Test', petConfig, actConfig, frameFiles },
    })
    assert.equal(begin.status, 201)
    assert.equal(begin.body.frameCount, 2)

    const firstUpload = await callRaw(
      route.handler,
      '/api/dsh-virtual-avatar/motion-pack-upload?session=' + begin.body.sessionId + '&path=' + encodeURIComponent(frameFiles[0]),
      png,
      { 'content-type': 'image/png' },
    )
    assert.equal(firstUpload.status, 201)
    assert.equal(firstUpload.body.uploaded, 1)

    const incomplete = await call(route.handler, { action: 'motion-pack-commit', args: { sessionId: begin.body.sessionId } })
    assert.equal(incomplete.status, 409)
    assert.equal(incomplete.body.code, 'MOTION_PACK_INCOMPLETE')

    const secondUpload = await callRaw(
      route.handler,
      '/api/dsh-virtual-avatar/motion-pack-upload?session=' + begin.body.sessionId + '&path=' + encodeURIComponent(frameFiles[1]),
      png,
      { 'content-type': 'image/png' },
    )
    assert.equal(secondUpload.status, 201)

    const committed = await call(route.handler, { action: 'motion-pack-commit', args: { sessionId: begin.body.sessionId } })
    assert.equal(committed.status, 200)
    assert.equal(committed.body.duplicate, false)
    assert.equal(committed.body.pack.frameCount, 2)
    const packId = committed.body.pack.id

    const listed = await call(route.handler, { action: 'motion-pack-list' })
    assert.equal(listed.body.packs.length, 1)
    assert.equal(listed.body.packs[0].id, packId)
    const deniedBinding = await call(route.handler, {
      action: 'motion-pack-bind',
      args: { packId, identityConfirmed: false, mapping: { idle: 'idle' } },
    })
    assert.equal(deniedBinding.status, 400)
    assert.equal(deniedBinding.body.code, 'MOTION_IDENTITY_CONFIRMATION_REQUIRED')

    const bound = await call(route.handler, {
      action: 'motion-pack-bind',
      args: {
        packId,
        identityConfirmed: true,
        mapping: { idle: 'idle', thinking: 'pat', patting: 'pat', cheerful: 'pat' },
      },
    })
    assert.equal(bound.status, 200)
    assert.equal(bound.body.binding.packId, packId)
    assert.equal(bound.body.view.character.motionBinding.identityConfirmed, true)
    assert.deepEqual(bound.body.view.character.motionBinding.mapping, { idle: 'idle', thinking: 'pat', patting: 'pat', cheerful: 'pat' })
    assert.equal(Object.hasOwn(bound.body.view.character.motionBinding, 'catalog'), false)

    const bindingRead = await call(route.handler, { action: 'motion-pack-binding' })
    assert.equal(bindingRead.body.binding.displayName, 'Whale Gesture Test')
    const runtimeBinding = await call(route.handler, { action: 'motion-pack-runtime' })
    assert.equal(runtimeBinding.body.binding.packId, packId)
    assert.deepEqual(Object.keys(runtimeBinding.body.binding.catalog.actions).sort(), ['idle', 'pat'])
    const unbound = await call(route.handler, { action: 'motion-pack-unbind' })
    assert.equal(unbound.status, 200)
    assert.equal(unbound.body.cleared, true)
    assert.equal(unbound.body.view.character.motionBinding, null)
    const rebound = await call(route.handler, {
      action: 'motion-pack-bind',
      args: { packId, identityConfirmed: true, mapping: { idle: 'idle' } },
    })
    assert.equal(rebound.status, 200)

    const fetchedPack = await call(route.handler, { action: 'motion-pack-get', args: { packId } })
    assert.equal(fetchedPack.status, 200)
    assert.equal(fetchedPack.body.pack.displayName, 'Whale Gesture Test')
    assert.equal(fetchedPack.body.pack.catalog.defaultAction, 'idle')

    const diagnostics = await call(route.handler, { action: 'diagnostics' })
    assert.equal(diagnostics.status, 200)
    assert.equal(diagnostics.body.diagnostics.storage.motionPackCount, 1)
    assert.equal(diagnostics.body.diagnostics.storage.motionPackFrames, 2)
    assert.equal(diagnostics.body.diagnostics.storage.motionPackBytes, png.length * 2)

    const frame = await callGet(route.handler,
      '/api/dsh-virtual-avatar/motion-packs/' + packId + '/action/stand_0.png')
    assert.equal(frame.status, 200)
    assert.equal(frame.headers['Content-Type'], 'image/png')
    assert.match(frame.headers['Cache-Control'], /immutable/)
    assert.deepEqual(frame.body, png)

    const after = await call(route.handler, { action: 'view' })
    assert.equal(after.body.revision, before.body.revision)
    assert.deepEqual(after.body.character.chatLines, before.body.character.chatLines)

    const removed = await call(route.handler, {
      action: 'motion-pack-delete',
      args: { packId, confirmed: true },
    })
    assert.equal(removed.status, 200)
    assert.equal(removed.body.deleted, true)
    assert.equal(plugin.store.listMotionPacks().length, 0)
    const noBindingAfterUninstall = await call(route.handler, { action: 'view' })
    assert.equal(noBindingAfterUninstall.body.character.motionBinding, null)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

test('DyberPet motion pack upload rejects invalid PNG bytes and expires incomplete sessions on shutdown', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-motion-invalid-'))
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
    const begin = await call(route.handler, {
      action: 'motion-pack-begin',
      args: {
        displayName: 'Invalid Pack',
        petConfig: { default: 'idle' },
        actConfig: { idle: { images: 'stand', act_num: 1 } },
        frameFiles: ['action/stand_0.png'],
      },
    })
    assert.equal(begin.status, 201)
    const invalid = await callRaw(
      route.handler,
      '/api/dsh-virtual-avatar/motion-pack-upload?session=' + begin.body.sessionId + '&path=' + encodeURIComponent('action/stand_0.png'),
      Buffer.from('not a png'),
      { 'content-type': 'image/png' },
    )
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.code, 'MOTION_FRAME_PNG_INVALID')
    const aborted = await call(route.handler, { action: 'motion-pack-abort', args: { sessionId: begin.body.sessionId } })
    assert.equal(aborted.status, 200)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})

test('DyberPet motion pack begin rejects unsafe frame paths with a client error', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-motion-path-'))
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
    const invalid = await call(route.handler, {
      action: 'motion-pack-begin',
      args: {
        displayName: 'Unsafe Pack',
        petConfig: { default: 'idle' },
        actConfig: { idle: { images: 'stand', act_num: 1 } },
        frameFiles: ['../stand_0.png'],
      },
    })
    assert.equal(invalid.status, 400)
    assert.match(invalid.body.code, /^DYBERPET_/)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('Whale model selection is isolated from the DSH default and persists locally', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-model-selection-'))
  let route
  let cleanup
  let globalSaves = 0
  const calls = []
  const defaultSelection = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
  const llm = {
    listProviders: () => [
      { id: 'deepseek-official', name: 'DeepSeek Official' },
      { id: 'openai-compatible', name: 'OpenAI Compatible' },
    ],
    listModels: async provider => provider === 'deepseek-official'
      ? [{ provider, id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]
      : [{ provider, id: 'gpt-4o-mini', name: 'GPT-4o mini' }],
    stream: async function* (input) {
      calls.push({ provider: input.provider, model: input.model })
      yield { type: 'text-delta', text: '模型选择已生效。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm,
    dshHomePath: (...segments) => join(home, ...segments),
    inject(names, callback) {
      if (names.includes('agentDefaultModel')) callback({
        agentDefaultModel: {
          currentSelection: () => ({ ...defaultSelection }),
          saveSelection: async () => { globalSaves++ },
        },
      })
    },
    effect(fn) { cleanup = fn() },
  }
  try {
    apply(ctx, {})
    const catalog = await call(route.handler, { action: 'model-catalog' })
    assert.equal(catalog.status, 200)
    assert.equal(catalog.body.selection.provider, 'deepseek-official')
    assert.equal(catalog.body.defaultSelection.model, 'deepseek-v4-flash')
    assert.equal(catalog.body.providers.length, 2)
    assert.equal(catalog.body.providers[1].models[0].id, 'gpt-4o-mini')

    const saved = await call(route.handler, {
      action: 'model-selection-set',
      args: { provider: 'openai-compatible', model: 'gpt-4o-mini' },
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.selection.provider, 'openai-compatible')

    const chat = await call(route.handler, {
      action: 'chat',
      args: { text: '请用当前选择的模型回复。', eventId: 'model-selection-chat-1' },
    })
    assert.equal(chat.status, 200)
    assert.deepEqual(calls.at(-1), { provider: 'openai-compatible', model: 'gpt-4o-mini' })

    const modelTest = await call(route.handler, { action: 'model-test' })
    assert.equal(modelTest.status, 200)
    assert.equal(modelTest.body.test.provider, 'openai-compatible')
    assert.equal(modelTest.body.test.model, 'gpt-4o-mini')

    const diagnostics = await call(route.handler, { action: 'diagnostics' })
    assert.equal(diagnostics.body.diagnostics.model.selectionSource, 'whale-local')
    assert.equal(diagnostics.body.diagnostics.model.selected.provider, 'openai-compatible')

    cleanup()
    cleanup = null
    route = null
    apply(ctx, {})
    const afterRestart = await call(route.handler, { action: 'model-catalog' })
    assert.equal(afterRestart.status, 200)
    assert.equal(afterRestart.body.savedSelection.provider, 'openai-compatible')
    assert.equal(afterRestart.body.savedSelection.model, 'gpt-4o-mini')

    const invalidProvider = await call(route.handler, {
      action: 'model-selection-set',
      args: { provider: 'not-enabled', model: 'some-model' },
    })
    assert.equal(invalidProvider.status, 400)
    assert.equal(invalidProvider.body.code, 'MODEL_PROVIDER_UNAVAILABLE')

    const cleared = await call(route.handler, { action: 'model-selection-clear' })
    assert.equal(cleared.status, 200)
    const afterClear = await call(route.handler, {
      action: 'chat',
      args: { text: '恢复默认模型后继续聊天。', eventId: 'model-selection-chat-2' },
    })
    assert.equal(afterClear.status, 200)
    assert.deepEqual(calls.at(-1), defaultSelection)
    assert.equal(globalSaves, 0, 'Whale model selection must not write the process-wide DSH default')
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})


test('retrying a completed chat event returns the original reply without a second model call', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-avatar-chat-retry-'))
  let route
  let cleanup
  const calls = []
  const ctx = {
    webServer: { register(value) { route = value; return () => { route = null } } },
    llm: {
      stream: async function* (input) {
        calls.push({ provider: input.provider, model: input.model })
        yield { type: 'text-delta', text: '主人，我已经收到这条消息啦。' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
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
    const args = { text: '刚才那条消息如果已经完成，请不要重复记录。', eventId: 'retryable-chat-event-1' }
    const first = await call(route.handler, { action: 'chat', args })
    assert.equal(first.status, 200)
    assert.equal(first.body.duplicate, false)
    assert.equal(first.body.view.character.chatLines.length, 2)
    assert.equal(calls.length, 1)

    const retry = await call(route.handler, { action: 'chat', args })
    assert.equal(retry.status, 200)
    assert.equal(retry.body.duplicate, true)
    assert.equal(retry.body.reply, first.body.reply)
    assert.equal(retry.body.view.character.chatLines.length, 2)
    assert.equal(calls.length, 1, 'retry must not call the model again')

    const conflict = await call(route.handler, {
      action: 'chat',
      args: { ...args, text: '这不是原来的消息。' },
    })
    assert.equal(conflict.status, 409)
    assert.equal(conflict.body.code, 'EVENT_ID_CONFLICT')
    assert.equal(calls.length, 1)
  } finally {
    if (typeof cleanup === 'function') cleanup()
    rmSync(home, { recursive: true, force: true })
  }
})
