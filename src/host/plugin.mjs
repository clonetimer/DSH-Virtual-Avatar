import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createAvatarStore } from '../storage/sqlite-store.mjs'
import { DeepseekWhaleService } from '../characters/deepseek-whale/service.mjs'
import { createDefaultPersonaRegistry } from '../ppl/registry.mjs'
import { extractMemoryCandidates } from '../memory/candidates.mjs'
import { DEEPSEEK_WHALE_PROFILE, affectionCap, relationshipStageLabel, resolveDeepseekWhaleProfile } from '../characters/deepseek-whale/profile.mjs'
import { resolveDeepseekWhalePresentation } from '../characters/deepseek-whale/presentation.mjs'
import { compileDyberPetMotionCatalog } from '../characters/deepseek-whale/dyberpet-motion.mjs'

export const name = 'dsh-virtual-avatar'
export const inject = ['webServer', 'llm']

const API_PATH = '/api/dsh-virtual-avatar'
const MAX_BODY_BYTES = 256 * 1024
const MAX_HISTORY = 12
const ASSET_ROOT = fileURLToPath(new URL('../../assets/deepseek-whale/', import.meta.url))
const PPL_SOURCE_PATH = fileURLToPath(new URL('../../personas/deepseek-whale.ppl', import.meta.url))
const PPL_IR_PATH = fileURLToPath(new URL('../../personas/deepseek-whale.pir.json', import.meta.url))
const ASSET_TYPES = Object.freeze({
  'maid-left.webp': 'image/webp',
  'whale-cheerful.webp': 'image/webp',
  'whale-shy.webp': 'image/webp',
  'whale-serious.webp': 'image/webp',
  'whale-confused.webp': 'image/webp',
  'whale-angry.webp': 'image/webp',
  'whale-frightened.webp': 'image/webp',
  'whale-exasperated.webp': 'image/webp',
  'whale-starry.webp': 'image/webp',
  'palace-night.webp': 'image/webp',
  'bg-deepseek-seaside-study.webp': 'image/webp',
})

function validateBrowserOrigin(req) {
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (fetchSite === 'cross-site') {
    const error = new Error('cross-site requests are not allowed')
    error.status = 403
    error.code = 'CROSS_SITE_REQUEST'
    throw error
  }
  const origin = req.headers?.origin
  if (!origin) return
  let parsed
  try { parsed = new URL(String(origin)) } catch {
    const error = new Error('invalid request origin')
    error.status = 403
    error.code = 'INVALID_ORIGIN'
    throw error
  }
  const host = String(req.headers?.host || '')
  if (!host || parsed.host.toLowerCase() !== host.toLowerCase()) {
    const error = new Error('request origin does not match DSH host')
    error.status = 403
    error.code = 'ORIGIN_MISMATCH'
    throw error
  }
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readJsonBody(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += data.length
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('request body too large')
      error.status = 413
      throw error
    }
    chunks.push(data)
  }
  if (!bytes) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (cause) {
    const error = new Error('invalid JSON request body', { cause })
    error.status = 400
    throw error
  }
}

async function readBinaryBody(req, maxBytes) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += data.length
    if (bytes > maxBytes) {
      const error = new Error('motion frame upload exceeds the 6 MiB per-file limit')
      error.status = 413
      error.code = 'MOTION_FRAME_TOO_LARGE'
      throw error
    }
    chunks.push(data)
  }
  return Buffer.concat(chunks)
}

function emotionFromText(text) {
  if (/生气|讨厌|哼|烦|滚|过分|笨蛋|可恶|不理|走开/u.test(text)) return 'angry'
  if (/害怕|吓|恐怖|啊啊|惊|别吓我/u.test(text)) return 'frightened'
  if (/无奈|累死|唉|好吧|算了|无语|头疼/u.test(text)) return 'exasperated'
  if (/星星|好美|浪漫|月亮|梦想|憧憬|心动|漂亮/u.test(text)) return 'starry'
  if (/害羞|呜|脸红|不好意思|才不|……/u.test(text)) return 'shy'
  if (/？|\?|什么|不懂|为啥|咦|没听懂/u.test(text)) return 'confused'
  if (/认真|工作|学习|讨论|问题|报告|项目|方案/u.test(text)) return 'serious'
  if (/开心|高兴|哈哈|太好了|太棒|喜欢|爱|幸福|抱抱|亲亲/u.test(text)) return 'cheerful'
  return 'normal'
}

async function streamReply(llm, model, system, contextMessages, userText, signal) {
  if (!llm || typeof llm.stream !== 'function') throw new Error('DSH LLM stream service is unavailable')
  const messages = [{
    role: 'user',
    content: [{ type: 'text', text: '（场景：深海女仆工坊的会客厅，暖黄的灯光。只扮演 DeepSeek 鲸鱼娘；这是持续陪伴对话，不存在必须推进的剧情任务。）' }],
    source: { kind: 'user' },
  }]
  for (const row of contextMessages || []) {
    messages.push({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'text', text: String(row.content || '') }],
      source: row.role === 'assistant'
        ? { kind: 'model', provider: model.provider, model: model.model }
        : { kind: 'user' },
    })
  }
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: String(userText || '') }],
    source: { kind: 'user' },
  })
  let output = ''
  let terminalReason = 'completed'
  const iterable = llm.stream({
    provider: model.provider,
    model: model.model,
    messages,
    system,
    temperature: 0.9,
    maxTokens: 1200,
    signal,
  })
  for await (const chunk of iterable) {
    if (!chunk) continue
    if (chunk.type === 'text-delta' && chunk.text) output += chunk.text
    if (chunk.type === 'finish' && chunk.reason) {
      const kind = String(chunk.reason.kind || '')
      if (kind === 'error' || kind === 'aborted') {
        const failure = chunk.reason.failure
        const error = new Error(failure?.message || failure?.code || kind)
        error.code = failure?.code || 'LLM_STREAM_FAILED'
        error.provider = model.provider
        error.model = model.model
        throw error
      }
      if (kind === 'max-tokens' || kind === 'length') terminalReason = 'max-tokens'
    }
  }
  if (!output.trim()) throw new Error('model stream produced no text')
  return { text: output.trim(), terminalReason }
}

function resolveDshHomePath(ctx) {
  if (typeof ctx.dshHomePath === 'function') return ctx.dshHomePath.bind(ctx)
  const root = process.env.DSH_HOME || join(homedir(), '.dsh')
  return (...segments) => join(root, ...segments)
}

function selectModel(llm, agentDefaultModel, config, store = null) {
  if (config.chatProvider && config.chatModel) {
    return { provider: String(config.chatProvider), model: String(config.chatModel), source: 'plugin-config' }
  }
  const local = store?.getChatModelSelection?.('deepseek')
  if (local?.provider && local?.model) {
    return { provider: String(local.provider), model: String(local.model), source: 'whale-local' }
  }
  try {
    const current = agentDefaultModel?.currentSelection?.()
    if (current?.provider && current?.model) return { provider: String(current.provider), model: String(current.model), source: 'dsh-default' }
  } catch { /* report missing model selection below */ }
  try {
    const providers = typeof llm?.listProviders === 'function' ? llm.listProviders() : []
    if (Array.isArray(providers) && providers.length) {
      const provider = providers.find(item => String(item.id || '').startsWith('deepseek-'))
      if (provider) return { provider: String(provider.id), model: String(config.fallbackModel || 'deepseek-v4-flash'), source: 'fallback' }
    }
  } catch { /* report missing model selection below */ }
  throw new Error('No DSH model is configured. Select a model in Whale settings or configure the DSH default model.')
}

function safeBackgroundAsset(state) {
  const key = String(state?.chosenBuiltinBackground || 'palace-night')
  const filename = key + '.webp'
  return ['palace-night.webp', 'bg-deepseek-seaside-study.webp'].includes(filename)
    ? filename
    : 'palace-night.webp'
}

function publicView(service, memoryService, config, store = null) {
  const loaded = service.loadState()
  const state = loaded.state
  const profile = resolveDeepseekWhaleProfile(state.profileOverrides || {})
  const pplRelationship = state.pplRuntime?.relationships?.admin || {}
  const runtimeEmotion = state.pplRuntime?.state?.emotion || {}
  const runtimePhysical = state.pplRuntime?.state?.physical || {}
  const pplState = {
    fatigue: Number(runtimePhysical.fatigue ?? 0),
    anxiety: Number(runtimeEmotion.anxiety ?? 0),
    embarrassment: Number(runtimeEmotion.embarrassment ?? 0),
    grief: Number(runtimeEmotion.grief ?? 0),
    anger: Number(runtimeEmotion.anger ?? 0),
  }
  const lastReplyEmotion = state.conversation?.chatLines?.filter(line => line.who === 'heroine').at(-1)?.emotion || 'normal'
  const presentation = resolveDeepseekWhalePresentation({ pplState, replyEmotion: lastReplyEmotion })
  const savedMotionBinding = store?.getMotionPackBinding('deepseek') || null
  const motionBinding = savedMotionBinding ? {
    characterId: savedMotionBinding.characterId,
    packId: savedMotionBinding.packId,
    displayName: savedMotionBinding.displayName,
    sourceHash: savedMotionBinding.sourceHash,
    identityConfirmed: savedMotionBinding.identityConfirmed,
    mapping: savedMotionBinding.mapping,
    updatedAt: savedMotionBinding.updatedAt,
  } : null
  const relationshipStage = String(pplRelationship.stage || state.relationship?.stage || 'acquaintance')
  const relationship = {
    ...state.relationship,
    stage: relationshipStage,
    trust: Number(pplRelationship.trust ?? state.relationship?.trust ?? 0.5),
    attachment: Number(pplRelationship.attachment ?? state.relationship?.attachment ?? 0.1),
    stageLabel: relationshipStageLabel(relationshipStage),
  }
  return {
    ok: true,
    enabled: config.enabled !== false,
    character: {
      id: 'deepseek',
      name: profile.displayName,
      address: profile.address,
      greeting: profile.greeting,
      visual: profile.visual,
      imageUrl: API_PATH + '/assets/' + presentation.asset,
      motionBinding,
      presentation: {
        expression: presentation.expression,
        expressionLabel: presentation.expressionLabel,
        expressionSource: presentation.expressionSource,
        patExpression: presentation.patExpression,
        patReply: presentation.patReply,
        motion: presentation.motion,
        tempo: presentation.tempo,
        mood: presentation.mood,
        shyness: presentation.shyness,
      },
      backgroundUrl: API_PATH + '/assets/' + safeBackgroundAsset(state),
      backgroundOverlay: Number.isFinite(Number(state.backgroundOverlay)) ? Math.max(0.15, Math.min(0.58, Number(state.backgroundOverlay))) : 0.32,
      expressionUrls: Object.fromEntries(Object.keys(ASSET_TYPES).filter(key => key.startsWith('whale-')).map(key => [key.replace('whale-', '').replace('.webp', ''), API_PATH + '/assets/' + key])),
      level: state.level,
      affection: state.affection,
      affectionCap: affectionCap(state.level),
      relationship,
      interactionScene: state.interactionScene || 'PRIVATE_HOME',
      interactionSceneLabel: (state.interactionScene || 'PRIVATE_HOME') === 'PUBLIC_SPACE' ? '公开场合' : '私密空间',
      pplState,
      chatLines: state.conversation?.chatLines || [],
      choices: state.conversation?.choices || [],
    },
    memories: memoryService.list({ ownerKind: 'character', ownerId: 'deepseek' }).length,
    revision: loaded.revision,
  }
}

export function apply(ctx, config = {}) {
  const webServer = ctx.webServer
  const llm = ctx.llm
  if (!webServer || typeof webServer.register !== 'function') throw new Error('dsh-virtual-avatar requires DSH webServer service')
  if (!llm || typeof llm.stream !== 'function') throw new Error('dsh-virtual-avatar requires DSH llm service')

  let agentDefaultModel = null
  if (typeof ctx.inject === 'function') {
    ctx.inject(['agentDefaultModel'], scope => { agentDefaultModel = scope.agentDefaultModel })
  }

  const dshHomePath = resolveDshHomePath(ctx)
  const storageRoot = dshHomePath('storages', 'dsh-virtual-avatar')
  const backupRoot = join(storageRoot, 'backups')
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 })
  const motionStagingRoot = join(storageRoot, 'motion-staging')
  mkdirSync(motionStagingRoot, { recursive: true, mode: 0o700 })
  for (const entry of readdirSync(motionStagingRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) rmSync(join(motionStagingRoot, entry.name), { recursive: true, force: true })
  }
  const motionUploadSessions = new Map()
  const motionUploadTtlMs = 15 * 60 * 1000
  const pruneMotionUploadSessions = () => {
    const now = Date.now()
    for (const [id, session] of motionUploadSessions) {
      if (now - session.createdAt > motionUploadTtlMs) {
        rmSync(session.directory, { recursive: true, force: true })
        motionUploadSessions.delete(id)
      }
    }
  }
  const getMotionUploadSession = id => {
    pruneMotionUploadSessions()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''))) {
      const error = new Error('motion upload session id is invalid')
      error.status = 400
      error.code = 'MOTION_UPLOAD_SESSION_INVALID'
      throw error
    }
    const session = motionUploadSessions.get(String(id))
    if (!session) {
      const error = new Error('motion upload session has expired or does not exist')
      error.status = 404
      error.code = 'MOTION_UPLOAD_SESSION_NOT_FOUND'
      throw error
    }
    return session
  }
  const store = createAvatarStore({ dshHomePath })
  const personaRegistry = createDefaultPersonaRegistry()
  const service = new DeepseekWhaleService({
    store,
    pplRuntime: personaRegistry.createRuntime('DEEPSEEK_WHALE'),
  })
  const memoryService = service.memory
  const recentErrors = []
  let lastSuccessfulTurnAt = null
  let lastModelTest = null
  const runtimeConfig = {
    enabled: config.enabled !== false,
    chatProvider: typeof config.chatProvider === 'string' ? config.chatProvider.trim() : '',
    chatModel: typeof config.chatModel === 'string' ? config.chatModel.trim() : '',
    fallbackModel: typeof config.fallbackModel === 'string' ? config.fallbackModel : 'deepseek-v4-flash',
  }

  const collectDirectoryStats = (directory, maxEntries = 10000) => {
    let files = 0
    let bytes = 0
    let truncated = false
    const walk = current => {
      let entries = []
      try { entries = readdirSync(current, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (files >= maxEntries) { truncated = true; return }
        if (entry.isSymbolicLink()) continue
        const absolute = join(current, entry.name)
        try {
          const stat = statSync(absolute)
          if (stat.isDirectory()) walk(absolute)
          else if (stat.isFile()) { files++; bytes += stat.size }
        } catch { /* skip files that disappear during inspection */ }
      }
    }
    walk(directory)
    return { files, bytes, truncated }
  }

  const buildDiagnostics = () => {
    const checkedAt = new Date().toISOString()
    const loaded = service.loadState()
    const persona = service.ppl.ir
    let model = null
    let modelSelectionError = null
    try { model = selectModel(llm, agentDefaultModel, runtimeConfig, store) }
    catch (error) { modelSelectionError = { code: error.code || 'MODEL_NOT_CONFIGURED', message: String(error.message || error).replace(/(?:sk|api)[-_ ]?key[=: ]+[^ ]+/ig, '[credential redacted]').slice(0, 200) } }
    let providers = []
    try {
      const catalog = typeof llm.listProviders === 'function' ? llm.listProviders() : []
      if (Array.isArray(catalog)) providers = catalog.map(item => ({ id: String(item.id || ''), name: String(item.name || item.id || ''), available: item.available !== false })).filter(item => item.id)
    } catch { providers = [] }
    const memories = service.listMemories()
    const mediaAssets = store.listMediaAssets('deepseek')
    const mediaBytes = mediaAssets.reduce((sum, item) => sum + (Number(item.byteLength) || 0), 0)
    const motionPacks = store.listMotionPacks('deepseek')
    const motionPackBytes = motionPacks.reduce((sum, item) => sum + (Number(item.byteLength) || 0), 0)
    const motionPackFrames = motionPacks.reduce((sum, item) => sum + (Number(item.frameCount) || 0), 0)
    let database = { status: 'unavailable', fileBytes: null }
    try {
      const dbPath = join(storageRoot, 'avatar.sqlite')
      database = { status: existsSync(dbPath) ? 'available' : 'not-created', fileBytes: existsSync(dbPath) ? statSync(dbPath).size : 0 }
      store.listAuditEvents('character', 'deepseek', { limit: 1 })
    } catch (error) { database = { status: 'error', code: error.code || 'SQLITE_ERROR' } }
    const backupDirectory = collectDirectoryStats(backupRoot)
    const mediaDirectory = collectDirectoryStats(join(storageRoot, 'assets'))
    let source = { status: 'missing' }
    let ir = { status: 'missing' }
    try { const bytes = readFileSync(PPL_SOURCE_PATH); source = { status: 'available', bytes: bytes.length } }
    catch (error) { source = { status: 'error', message: String(error.message || error).slice(0, 160) } }
    try {
      const raw = readFileSync(PPL_IR_PATH, 'utf8')
      const parsed = JSON.parse(raw)
      ir = { status: parsed.schema === 'ppl.persona-ir/0.3' && parsed.persona?.id === 'DEEPSEEK_WHALE' ? 'valid' : 'incompatible', schema: parsed.schema || null, personaId: parsed.persona?.id || null, version: parsed.persona?.version || null, bytes: Buffer.byteLength(raw) }
    } catch (error) { ir = { status: 'error', message: String(error.message || error).slice(0, 160) } }
    return {
      checkedAt,
      plugin: { id: name, version: '0.1.0-dev.14', enabled: runtimeConfig.enabled },
      model: { status: model ? 'selected' : 'not-configured', selected: model, selectionError: modelSelectionError, providers, selectionSource: model?.source || null, hasWhaleOverride: Boolean(store.getChatModelSelection('deepseek')), configuredExplicitly: Boolean(runtimeConfig.chatProvider && runtimeConfig.chatModel), lastTest: lastModelTest },
      persona: { source, ir, runtime: persona ? 'loaded' : 'unavailable', rules: Array.isArray(persona?.rules) ? persona.rules.length : 0, registered: personaRegistry.list() },
      storage: { database, memoryCount: memories.length, pinnedMemoryCount: memories.filter(item => item.pinned).length, mediaAssetCount: mediaAssets.length, mediaBytes, motionPackCount: motionPacks.length, motionPackFrames, motionPackBytes, mediaDirectory, backupDirectory },
      companion: {
        level: loaded.state.level,
        affection: loaded.state.affection,
        trust: loaded.state.pplRuntime?.relationships?.admin?.trust ?? loaded.state.relationship?.trust ?? null,
        attachment: loaded.state.pplRuntime?.relationships?.admin?.attachment ?? loaded.state.relationship?.attachment ?? null,
        relationshipStage: loaded.state.pplRuntime?.relationships?.admin?.stage || loaded.state.relationship?.stage || 'acquaintance',
        interactionScene: loaded.state.interactionScene || 'PRIVATE_HOME',
        pplState: loaded.state.pplRuntime?.state || {},
        stateRevision: loaded.revision,
        lastConversationAt: loaded.state.conversation?.chatLines?.at(-1)?.at || null,
        lastSuccessfulTurnAt,
      },
      recentErrors: recentErrors.slice(0, 10),
    }
  }

  const handler = async (req, res) => {
    let action = 'unknown'
    const pathname = new URL(req.url || '/', 'http://dsh.local').pathname
    const assetMarker = pathname.lastIndexOf('/assets/')
    if (req.method === 'GET' && assetMarker >= 0) {
      const assetName = decodeURIComponent(pathname.slice(assetMarker + '/assets/'.length))
      const contentType = ASSET_TYPES[assetName]
      if (!contentType || assetName.includes('/') || assetName.includes('\\\\')) {
        json(res, 404, { ok: false, error: 'asset not found' })
        return
      }
      try {
        const bytes = readFileSync(join(ASSET_ROOT, assetName))
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' })
        res.end(bytes)
      } catch {
        json(res, 404, { ok: false, error: 'asset unavailable' })
      }
      return
    }
    const motionFrameMarker = API_PATH + '/motion-packs/'
    if (req.method === 'GET' && pathname.startsWith(motionFrameMarker)) {
      try {
        const parts = pathname.slice(motionFrameMarker.length).split('/').map(decodeURIComponent)
        if (parts.length !== 3 || parts[1] !== 'action' || !/^[0-9a-f-]{36}$/i.test(parts[0])) {
          json(res, 404, { ok: false, error: 'motion frame not found' })
          return
        }
        const frame = store.readMotionPackFrame(parts[0], 'action/' + parts[2])
        if (!frame) {
          json(res, 404, { ok: false, error: 'motion frame not found' })
          return
        }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': frame.byteLength, 'Cache-Control': 'private, max-age=31536000, immutable', 'ETag': '"' + frame.sha256 + '"', 'X-Content-Type-Options': 'nosniff' })
        res.end(frame.bytes)
      } catch (error) {
        json(res, Number.isInteger(error?.status) ? error.status : 400, { ok: false, error: String(error.message || error).slice(0, 200), code: error.code || 'MOTION_FRAME_READ_FAILED' })
      }
      return
    }
    if (req.method === 'GET') {
      json(res, 200, { ok: true, service: name, character: 'deepseek', version: '0.1.0-dev.14' })
      return
    }
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      validateBrowserOrigin(req)
      if (pathname === API_PATH + '/motion-pack-upload') {
        action = 'motion-pack-upload'
        if (runtimeConfig.enabled === false) {
          json(res, 403, { ok: false, error: 'DeepSeek Whale companion is disabled' })
          return
        }
        const requestUrl = new URL(req.url || '/', 'http://dsh.local')
        const session = getMotionUploadSession(requestUrl.searchParams.get('session'))
        const framePath = requestUrl.searchParams.get('path') || ''
        if (!/^action\/[A-Za-z0-9_-]+_[0-9]+\.png$/i.test(framePath) || !session.expected.has(framePath)) {
          json(res, 400, { ok: false, error: 'frame path is not part of this motion pack', code: 'MOTION_FRAME_UNEXPECTED' })
          return
        }
        if (session.uploaded.has(framePath)) {
          json(res, 409, { ok: false, error: 'frame has already been uploaded', code: 'MOTION_FRAME_DUPLICATE' })
          return
        }
        const contentType = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase()
        if (contentType !== 'image/png') {
          json(res, 415, { ok: false, error: 'motion frame upload must use image/png', code: 'MOTION_FRAME_CONTENT_TYPE_INVALID' })
          return
        }
        const bytes = await readBinaryBody(req, 6 * 1024 * 1024)
        if (motionUploadSessions.get(session.id) !== session || Date.now() - session.createdAt > motionUploadTtlMs) {
          if (motionUploadSessions.get(session.id) === session) {
            rmSync(session.directory, { recursive: true, force: true })
            motionUploadSessions.delete(session.id)
          }
          json(res, 410, { ok: false, error: 'motion upload session was cancelled or expired', code: 'MOTION_UPLOAD_SESSION_EXPIRED' })
          return
        }
        if (session.uploaded.has(framePath)) {
          json(res, 409, { ok: false, error: 'frame has already been uploaded', code: 'MOTION_FRAME_DUPLICATE' })
          return
        }
        if (bytes.length < 8 || !Buffer.from([137,80,78,71,13,10,26,10]).equals(bytes.subarray(0,8))) {
          json(res, 400, { ok: false, error: 'uploaded frame is not a valid PNG', code: 'MOTION_FRAME_PNG_INVALID' })
          return
        }
        if (session.totalBytes + bytes.length > 64 * 1024 * 1024) {
          json(res, 413, { ok: false, error: 'motion pack exceeds the 64 MiB total limit', code: 'MOTION_PACK_TOO_LARGE' })
          return
        }
        const destination = join(session.directory, ...framePath.split('/'))
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
        writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 })
        session.uploaded.add(framePath)
        session.totalBytes += bytes.length
        json(res, 201, { ok: true, uploaded: session.uploaded.size, total: session.expected.size, byteLength: bytes.length })
        return
      }
      const body = await readJsonBody(req)
      action = typeof body.action === 'string' ? body.action : 'view'
      const args = body.args && typeof body.args === 'object' ? body.args : {}
      if (runtimeConfig.enabled === false && action !== 'view') {
        json(res, 403, { ok: false, error: 'DeepSeek Whale companion is disabled' })
        return
      }

      if (action === 'history') {
        const loaded = service.loadState()
        const lines = loaded.state.conversation?.chatLines || []
        const limit = Math.min(100, Math.max(1, Number.isSafeInteger(args.limit) ? args.limit : 30))
        const before = Number.isSafeInteger(args.before) ? Math.max(0, args.before) : lines.length
        const start = Math.max(0, before - limit)
        json(res, 200, {
          ok: true,
          lines: lines.slice(start, before),
          nextBefore: start > 0 ? start : null,
          total: lines.length,
        })
        return
      }

      if (action === 'history-search') {
        const query = typeof args.query === 'string' ? args.query.trim().toLocaleLowerCase() : ''
        if (query.length < 2) {
          json(res, 400, { ok: false, code: 'SEARCH_QUERY_TOO_SHORT', error: '请输入至少两个字符' })
          return
        }
        const loaded = service.loadState()
        const lines = loaded.state.conversation?.chatLines || []
        const matches = []
        for (let index = lines.length - 1; index >= 0 && matches.length < 100; index--) {
          const line = lines[index]
          if (String(line.text || '').toLocaleLowerCase().includes(query)) matches.push({ ...line, index })
        }
        json(res, 200, { ok: true, query: args.query.trim(), matches, total: matches.length, truncated: matches.length === 100 })
        return
      }

      if (action === 'relationship-history') {
        const events = store.listAuditEvents('character', 'deepseek', { limit: args.limit })
          .filter(event => event.type === 'TURN_COMPLETED' || event.type === 'AFFECTION_DELTA')
          .map(event => ({
            ...event,
            label: event.type === 'TURN_COMPLETED' ? '完成一次陪伴对话' : '好感度调整',
            details: {
              ...event.details,
              affectionDelta: event.details.appliedAffectionDelta ?? event.details.delta ?? 0,
              stageChanged: event.details.stageChanged === true,
              levelChanged: event.details.levelChanged === true,
            },
          }))
        json(res, 200, { ok: true, events })
        return
      }

      if (action === 'model-catalog') {
        const registered = typeof llm.listProviders === 'function' ? llm.listProviders() : []
        const providers = await Promise.all((Array.isArray(registered) ? registered : []).map(async item => {
          const provider = String(item.id || '')
          if (!provider) return null
          let models = []
          let catalogError = null
          if (typeof llm.listModels === 'function') {
            try {
              const listed = await llm.listModels(provider)
              models = (Array.isArray(listed) ? listed : []).map(model => ({
                id: String(model.id || ''),
                name: String(model.name || model.id || ''),
                description: typeof model.description === 'string' ? model.description : '',
                inputModalities: Array.isArray(model.inputModalities) ? model.inputModalities : [],
              })).filter(model => model.id)
            } catch (error) {
              catalogError = String(error?.message || error).slice(0, 180)
            }
          }
          return { id: provider, name: String(item.name || provider), models, catalogError }
        })).then(rows => rows.filter(Boolean))
        let defaultSelection = null
        try {
          const current = agentDefaultModel?.currentSelection?.()
          if (current?.provider && current?.model) defaultSelection = { provider: String(current.provider), model: String(current.model) }
        } catch { /* no DSH default configured */ }
        const savedSelection = store.getChatModelSelection('deepseek')
        let selection = null
        let selectionError = null
        try {
          const current = selectModel(llm, agentDefaultModel, runtimeConfig, store)
          selection = { provider: current.provider, model: current.model, source: current.source }
        } catch (error) {
          selectionError = String(error?.message || error).slice(0, 200)
        }
        json(res, 200, {
          ok: true,
          providers,
          selection,
          defaultSelection,
          savedSelection,
          locked: Boolean(runtimeConfig.chatProvider && runtimeConfig.chatModel),
          selectionError,
        })
        return
      }

      if (action === 'model-selection-set') {
        if (runtimeConfig.chatProvider && runtimeConfig.chatModel) {
          const error = new Error('模型由插件配置固定，不能在角色界面修改。')
          error.status = 409
          error.code = 'MODEL_SELECTION_LOCKED'
          throw error
        }
        const provider = String(args.provider || '').trim()
        const model = String(args.model || '').trim()
        const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : []
        if (!provider || !Array.isArray(providers) || !providers.some(item => item.id === provider)) {
          const error = new Error('所选模型服务商当前未在 DSH 中启用。请先在 DSH 模型设置中配置并启用该服务商。')
          error.status = 400
          error.code = 'MODEL_PROVIDER_UNAVAILABLE'
          throw error
        }
        const selection = store.setChatModelSelection({ characterId: 'deepseek', provider, model })
        json(res, 200, { ok: true, selection, source: 'whale-local' })
        return
      }

      if (action === 'model-selection-clear') {
        if (runtimeConfig.chatProvider && runtimeConfig.chatModel) {
          const error = new Error('模型由插件配置固定，不能在角色界面修改。')
          error.status = 409
          error.code = 'MODEL_SELECTION_LOCKED'
          throw error
        }
        const result = store.clearChatModelSelection('deepseek')
        json(res, 200, { ok: true, ...result })
        return
      }

      if (action === 'diagnostics') {
        json(res, 200, { ok: true, diagnostics: buildDiagnostics() })
        return
      }

      if (action === 'model-test') {
        const model = selectModel(llm, agentDefaultModel, runtimeConfig, store)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(new Error('model test timed out')), 20000)
        let output = ''
        try {
          const iterable = llm.stream({
            provider: model.provider,
            model: model.model,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] }],
            system: 'This is a connectivity test. Reply with OK only.',
            temperature: 0,
            maxTokens: 8,
            signal: controller.signal,
          })
          for await (const chunk of iterable) {
            if (chunk?.type === 'text-delta' && chunk.text) output += chunk.text
            if (chunk?.type === 'finish' && ['error','aborted'].includes(String(chunk.reason?.kind || ''))) throw new Error(chunk.reason?.failure?.message || 'model stream failed')
          }
          if (!output.trim()) throw new Error('model returned no text')
          lastModelTest = { at: new Date().toISOString(), status: 'success', provider: model.provider, model: model.model }
          json(res, 200, { ok: true, test: lastModelTest })
        } catch (error) {
          lastModelTest = { at: new Date().toISOString(), status: 'failed', provider: model.provider, model: model.model, code: error.code || 'MODEL_TEST_FAILED', message: String(error.message || error).slice(0, 200) }
          throw error
        } finally { clearTimeout(timeout) }
        return
      }

      if (action === 'view') {
        json(res, 200, publicView(service, memoryService, runtimeConfig, store))
        return
      }

      if (action === 'motion-pack-begin') {
        const petConfig = args.petConfig
        const actConfig = args.actConfig
        const frameFiles = args.frameFiles
        if (!Array.isArray(frameFiles) || !frameFiles.length || frameFiles.length > 1200) {
          json(res, 400, { ok: false, error: 'motion pack must contain 1 to 1200 PNG frames', code: 'MOTION_PACK_FRAME_COUNT_INVALID' })
          return
        }
        if (Buffer.byteLength(JSON.stringify(petConfig || {})) > 64 * 1024 || Buffer.byteLength(JSON.stringify(actConfig || {})) > 64 * 1024) {
          json(res, 413, { ok: false, error: 'motion pack configuration exceeds 64 KiB', code: 'MOTION_PACK_CONFIG_TOO_LARGE' })
          return
        }
        let catalog
        try { catalog = compileDyberPetMotionCatalog({ petConfig, actConfig, frameFiles }) }
        catch (error) {
          if (String(error?.code || '').startsWith('DYBERPET_')) error.status = 400
          throw error
        }
        pruneMotionUploadSessions()
        if (motionUploadSessions.size >= 3) {
          json(res, 429, { ok: false, error: '已有 3 个动作包导入任务，请先完成或取消其中一个。', code: 'MOTION_UPLOAD_SESSION_LIMIT' })
          return
        }
        const expected = new Set(frameFiles)
        if (expected.size !== frameFiles.length) {
          json(res, 400, { ok: false, error: 'motion pack contains duplicate frame paths', code: 'MOTION_PACK_FRAME_DUPLICATE' })
          return
        }
        const sessionId = randomUUID()
        const directory = join(motionStagingRoot, sessionId)
        mkdirSync(directory, { recursive: true, mode: 0o700 })
        motionUploadSessions.set(sessionId, {
          id: sessionId,
          createdAt: Date.now(),
          directory,
          displayName: String(args.displayName || '').trim().slice(0, 64) || 'DyberPet 动作包',
          petConfig,
          actConfig,
          catalog,
          expected,
          uploaded: new Set(),
          totalBytes: 0,
        })
        json(res, 201, { ok: true, sessionId, frameCount: expected.size, actionCount: Object.keys(catalog.actions).length, expiresInSeconds: Math.floor(motionUploadTtlMs / 1000) })
        return
      }

      if (action === 'motion-pack-commit') {
        const session = getMotionUploadSession(args.sessionId)
        const missing = [...session.expected].filter(path => !session.uploaded.has(path))
        if (missing.length) {
          json(res, 409, { ok: false, error: 'motion pack is missing ' + missing.length + ' frame uploads', code: 'MOTION_PACK_INCOMPLETE', missing: missing.slice(0, 20) })
          return
        }
        const frames = [...session.expected].map(path => ({
          path,
          bytes: readFileSync(join(session.directory, ...path.split('/'))),
        }))
        const imported = store.importMotionPack({
          characterId: 'deepseek',
          displayName: session.displayName,
          petConfig: session.petConfig,
          actConfig: session.actConfig,
          catalog: session.catalog,
          frames,
        })
        rmSync(session.directory, { recursive: true, force: true })
        motionUploadSessions.delete(session.id)
        json(res, 200, {
          ok: true,
          duplicate: imported.duplicate,
          pack: {
            id: imported.pack.id,
            characterId: imported.pack.characterId,
            displayName: imported.pack.displayName,
            sourceHash: imported.pack.sourceHash,
            frameCount: imported.pack.frameCount,
            byteLength: imported.pack.byteLength,
            createdAt: imported.pack.createdAt,
            catalog: imported.pack.catalog,
          },
        })
        return
      }

      if (action === 'motion-pack-abort') {
        const session = getMotionUploadSession(args.sessionId)
        rmSync(session.directory, { recursive: true, force: true })
        motionUploadSessions.delete(session.id)
        json(res, 200, { ok: true, aborted: true })
        return
      }

      if (action === 'motion-pack-list') {
        const packs = store.listMotionPacks('deepseek').map(pack => ({
          id: pack.id,
          characterId: pack.characterId,
          displayName: pack.displayName,
          sourceHash: pack.sourceHash,
          frameCount: pack.frameCount,
          byteLength: pack.byteLength,
          createdAt: pack.createdAt,
          actionCount: Object.keys(pack.catalog.actions || {}).length,
          actionIds: Object.keys(pack.catalog.actions || {}),
        }))
        json(res, 200, { ok: true, packs })
        return
      }

      if (action === 'motion-pack-bind') {
        let binding
        try {
          binding = store.setMotionPackBinding({
            characterId: 'deepseek',
            packId: args.packId,
            identityConfirmed: args.identityConfirmed === true,
            mapping: args.mapping,
          })
        } catch (error) {
          if (String(error?.code || '').startsWith('MOTION_')) error.status = 400
          throw error
        }
        json(res, 200, { ok: true, binding: {
          characterId: binding.characterId,
          packId: binding.packId,
          displayName: binding.displayName,
          sourceHash: binding.sourceHash,
          identityConfirmed: binding.identityConfirmed,
          mapping: binding.mapping,
          updatedAt: binding.updatedAt,
        }, view: publicView(service, memoryService, runtimeConfig, store) })
        return
      }

      if (action === 'motion-pack-unbind') {
        const result = store.clearMotionPackBinding('deepseek')
        json(res, 200, { ok: true, ...result, view: publicView(service, memoryService, runtimeConfig, store) })
        return
      }

      if (action === 'motion-pack-binding') {
        const binding = store.getMotionPackBinding('deepseek')
        json(res, 200, { ok: true, binding: binding ? {
          characterId: binding.characterId,
          packId: binding.packId,
          displayName: binding.displayName,
          sourceHash: binding.sourceHash,
          identityConfirmed: binding.identityConfirmed,
          mapping: binding.mapping,
          updatedAt: binding.updatedAt,
        } : null })
        return
      }

      if (action === 'motion-pack-runtime') {
        const binding = store.getMotionPackBinding('deepseek')
        if (!binding) {
          json(res, 200, { ok: true, binding: null })
          return
        }
        const actionIds = [...new Set(Object.values(binding.mapping || {}))]
          .filter(id => binding.catalog?.actions?.[id])
        json(res, 200, { ok: true, binding: {
          packId: binding.packId,
          mapping: binding.mapping,
          catalog: {
            schema: binding.catalog.schema,
            defaultAction: binding.catalog.defaultAction,
            actions: Object.fromEntries(actionIds.map(id => [id, binding.catalog.actions[id]])),
          },
        } })
        return
      }

      if (action === 'motion-pack-get') {
        const pack = store.getMotionPack(args.packId)
        if (!pack) {
          json(res, 404, { ok: false, error: 'motion pack not found', code: 'MOTION_PACK_NOT_FOUND' })
          return
        }
        json(res, 200, { ok: true, pack })
        return
      }

      if (action === 'motion-pack-delete') {
        const result = store.deleteMotionPack(args.packId, { confirmed: args.confirmed === true })
        json(res, 200, { ok: true, ...result, view: publicView(service, memoryService, runtimeConfig, store) })
        return
      }

      if (action === 'motion-preview-validate') {
        // Preview-only: only role configuration and filenames reach the host.
        // PNG bytes stay in the user's browser; no state or artwork is written.
        let catalog
        try {
          catalog = compileDyberPetMotionCatalog({
            petConfig: args.petConfig,
            actConfig: args.actConfig,
            frameFiles: args.frameFiles,
          })
        } catch (error) {
          if (String(error?.code || '').startsWith('DYBERPET_')) error.status = 400
          throw error
        }
        json(res, 200, { ok: true, catalog, persistent: false, previewOnly: true })
        return
      }

      if (action === 'scene-set') {
        const result = service.setInteractionScene(args.scene)
        json(res, 200, {
          ok: true,
          scene: result.scene,
          changed: result.changed,
          revision: result.revision,
          view: publicView(service, memoryService, runtimeConfig, store),
        })
        return
      }

      if (action === 'chat') {
        const text = typeof args.text === 'string' ? args.text.trim().slice(0, 500) : ''
        if (!text) {
          json(res, 400, { ok: false, error: 'message text is required' })
          return
        }
        const sessionId = typeof args.sessionId === 'string' && args.sessionId.trim() ? args.sessionId.trim().slice(0, 160) : 'deepseek-whale-default'
        const loaded = service.loadState({ sessionId })
        const turn = Number.isSafeInteger(args.turn) ? args.turn : (Number(loaded.state.pplRuntime?.session?.turn) || 0) + 1
        const eventId = typeof args.eventId === 'string' && args.eventId.trim()
          ? args.eventId.trim().slice(0, 200)
          : sessionId + ':' + turn + ':' + randomUUID()
        const choice = typeof args.choiceId === 'string'
          ? (loaded.state.conversation?.choices || []).find(item => item && item.id === args.choiceId) || null
          : null
        const prepared = service.prepareTurn({
          text,
          choice,
          eventId,
          sessionId,
          turn,
          step: Number.isSafeInteger(args.step) ? args.step : 1,
          context: {},
          activityHint: typeof args.activityHint === 'string' ? args.activityHint.slice(0, 600) : '',
        })
        const model = selectModel(llm, agentDefaultModel, runtimeConfig, store)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(new Error('DeepSeek Whale model request timed out')), 110000)
        let generated
        try {
          generated = await streamReply(
            llm,
            model,
            prepared.system,
            prepared.contextMessages,
            text,
            controller.signal,
          )
        } finally {
          clearTimeout(timeout)
        }
        const committed = service.finalizeTurn(prepared, {
          reply: generated.text,
          terminalReason: generated.terminalReason,
          emotion: emotionFromText(generated.text),
          choices: [],
        })
        lastSuccessfulTurnAt = new Date().toISOString()
        json(res, 200, {
          ok: true,
          eventId,
          reply: generated.text,
          emotion: emotionFromText(generated.text),
          choices: [],
          view: publicView(service, memoryService, runtimeConfig, store),
          duplicate: committed.duplicate === true,
        })
        return
      }

      if (action === 'summary-candidate') {
        const candidate = service.createMemorySummaryCandidate()
        json(res, 200, { ok: true, candidate })
        return
      }

      if (action === 'summary-confirm') {
        const summary = typeof args.summary === 'string' ? args.summary.trim() : ''
        if (!summary) {
          json(res, 400, { ok: false, error: 'summary is required' })
          return
        }
        const result = service.updateStorySummary({
          summary,
          expectedStoryRevision: Number.isSafeInteger(args.expectedStoryRevision) ? args.expectedStoryRevision : undefined,
        })
        json(res, 200, { ok: true, ...result })
        return
      }

      if (action === 'memory-candidates') {
        const text = typeof args.text === 'string' ? args.text.trim().slice(0, 500) : ''
        json(res, 200, { ok: true, candidates: extractMemoryCandidates(text) })
        return
      }

      if (action === 'memory-add') {
        const text = typeof args.text === 'string' ? args.text.trim() : ''
        const result = service.remember(text, {
          eventId: typeof args.eventId === 'string' ? args.eventId : randomUUID(),
          source: 'explicit-user-memory',
        })
        json(res, 200, { ok: true, result, view: publicView(service, memoryService, runtimeConfig, store) })
        return
      }
      if (action === 'backup-list') {
        const backups = readdirSync(backupRoot, { withFileTypes: true })
          .filter(entry => entry.isDirectory() && /^backup-[a-f0-9-]+$/.test(entry.name))
          .map(entry => {
            const directory = join(backupRoot, entry.name)
            try {
              const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))
              return { id: entry.name, createdAt: manifest.createdAt, fileCount: manifest.files?.length || 0, byteLength: manifest.files?.reduce((sum, item) => sum + (item.byteLength || 0), 0) || 0 }
            } catch { return { id: entry.name, valid: false } }
          }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        json(res, 200, { ok: true, backups })
        return
      }
      if (action === 'backup-create') {
        const id = 'backup-' + randomUUID()
        const result = store.createBackup(join(backupRoot, id))
        json(res, 200, { ok: true, backup: { id, createdAt: result.createdAt, fileCount: result.fileCount, byteLength: result.byteLength } })
        return
      }
      if (action === 'backup-verify') {
        const id = String(args.backupId || '')
        if (!/^backup-[a-f0-9-]+$/.test(id)) {
          json(res, 400, { ok: false, error: 'invalid backup id' })
          return
        }
        const result = store.verifyBackup(join(backupRoot, id))
        json(res, 200, { ok: true, verification: result })
        return
      }
      if (action === 'backup-restore') {
        const id = String(args.backupId || '')
        if (args.confirmed !== true) {
          json(res, 400, { ok: false, code: 'CONFIRMATION_REQUIRED', error: 'explicit restore confirmation is required' })
          return
        }
        if (!/^backup-[a-f0-9-]+$/.test(id)) {
          json(res, 400, { ok: false, error: 'invalid backup id' })
          return
        }
        const result = store.restoreBackup(join(backupRoot, id))
        json(res, 200, { ok: true, restore: result })
        return
      }
      if (action === 'memory-list') {
        const level = ['all','core','mid','edge'].includes(args.level) ? args.level : 'all'
        const pinned = ['all','pinned','normal'].includes(args.pinned) ? args.pinned : 'all'
        json(res, 200, { ok: true, memories: service.listMemories({ query: args.query, level, pinned }) })
        return
      }
      if (action === 'memory-edit') {
        const memoryId = String(args.memoryId || '')
        const result = service.editMemory(memoryId, args.text)
        if (!result) {
          json(res, 404, { ok: false, error: 'memory not found' })
          return
        }
        json(res, 200, { ok: true, memory: result })
        return
      }
      if (action === 'memory-export') {
        json(res, 200, { ok: true, export: service.exportMemories() })
        return
      }
      if (action === 'memory-pin') {
        const result = service.pinMemory(String(args.memoryId || ''), args.pinned !== false)
        if (!result) {
          json(res, 404, { ok: false, error: 'memory not found' })
          return
        }
        json(res, 200, { ok: true, memory: result })
        return
      }
      if (action === 'memory-delete') {
        const removed = service.removeMemory(String(args.memoryId || ''))
        json(res, removed ? 200 : 404, { ok: removed, error: removed ? undefined : 'memory not found' })
        return
      }
      if (action === 'background-set') {
        const key = String(args.background || '')
        const backgrounds = new Set(['palace-night', 'bg-deepseek-seaside-study'])
        if (!backgrounds.has(key)) {
          json(res, 400, { ok: false, error: 'unsupported background' })
          return
        }
        const loaded = service.loadState()
        const currentOverlay = Number.isFinite(Number(loaded.state.backgroundOverlay)) ? Number(loaded.state.backgroundOverlay) : 0.32
        const overlay = args.overlay === undefined ? currentOverlay : Number(args.overlay)
        if (!Number.isFinite(overlay) || overlay < 0.15 || overlay > 0.58) {
          json(res, 400, { ok: false, error: 'background overlay must be between 0.15 and 0.58', code: 'BACKGROUND_OVERLAY_INVALID' })
          return
        }
        const next = { ...loaded.state, chosenBuiltinBackground: key, backgroundOverlay: overlay }
        const saved = store.saveCharacterState('deepseek', next, loaded.revision)
        json(res, 200, { ok: true, background: key, revision: saved.revision, view: publicView(service, memoryService, runtimeConfig, store) })
        return
      }

      if (action === 'profile-get') {
        const loaded = service.loadState()
        json(res, 200, { ok: true, profile: resolveDeepseekWhaleProfile(loaded.state.profileOverrides || {}) })
        return
      }
      if (action === 'profile-set') {
        const loaded = service.loadState()
        const saved = service.updateProfile(args.profile || {}, { expectedRevision: loaded.revision })
        json(res, 200, { ok: true, profile: resolveDeepseekWhaleProfile(saved.state.profileOverrides || {}), revision: saved.revision })
        return
      }

      json(res, 404, { ok: false, error: 'unknown action: ' + action })
    } catch (error) {
      recentErrors.unshift({ at: new Date().toISOString(), action, code: error?.code || 'AVATAR_ERROR', message: String(error?.message || error).replace(/(?:sk|api)[-_ ]?key[=: ]+[^ ]+/ig, '[credential redacted]').slice(0, 240) })
      if (recentErrors.length > 10) recentErrors.length = 10
      const status = Number.isInteger(error?.status) ? error.status : error?.code === 'REVISION_CONFLICT' ? 409 : 500
      const safeMessage = String(error?.message || error).replace(/(?:sk|api)[-_ ]?key[=: ]+[^ ]+/ig, '[credential redacted]').slice(0, 240)
      json(res, status, { ok: false, error: safeMessage, code: error?.code || 'AVATAR_ERROR' })
    }
  }

  const dispose = webServer.register({ kind: 'prefix', path: API_PATH, handler })
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      try { if (typeof dispose === 'function') dispose() } catch { /* host may already be disposing */ }
      for (const session of motionUploadSessions.values()) {
        try { rmSync(session.directory, { recursive: true, force: true }) } catch { /* ignore staging cleanup failures */ }
      }
      motionUploadSessions.clear()
      try { store.close() } catch { /* ignore shutdown close failures */ }
    })
  }

  return { service, store, apiPath: API_PATH }
}
