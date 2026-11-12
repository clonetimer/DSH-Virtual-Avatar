const ACTION_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u
const FRAME_PREFIX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u
const FRAME_FILE = /^([A-Za-z0-9][A-Za-z0-9_-]{0,63})_(\d+)\.png$/iu
const DIRECTIONS = new Set(['left', 'right', 'up', 'down'])
const MAX_ACTIONS = 64
const MAX_FRAMES = 1200
const MAX_REPEATS = 50
const MAX_ACTION_MS = 60_000
const MAX_FRAME_MS = 10_000
const MIN_FRAME_MS = 15

function fail(code, message) {
  const error = new TypeError(message)
  error.code = code
  throw error
}

function finiteNumber(value, fallback, min, max, code, field) {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    fail(code, field + ' is outside the supported range')
  }
  return number
}

function normalizeFramePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) {
    fail('DYBERPET_FRAME_PATH_INVALID', 'frame path must be a safe relative PNG path')
  }
  const path = value.startsWith('action/') ? value.slice('action/'.length) : value
  if (path.includes('/') || path === '.' || path === '..' || !path.toLowerCase().endsWith('.png')) {
    fail('DYBERPET_FRAME_PATH_INVALID', 'only PNG files directly under action/ are supported')
  }
  return path
}

function frameInventory(frameFiles) {
  if (!Array.isArray(frameFiles) || frameFiles.length > MAX_FRAMES) {
    fail('DYBERPET_FRAME_INVENTORY_INVALID', 'frame inventory is missing or exceeds the limit')
  }
  const inventory = new Map()
  const seen = new Set()
  for (const raw of frameFiles) {
    const file = normalizeFramePath(raw)
    if (seen.has(file.toLowerCase())) {
      fail('DYBERPET_FRAME_DUPLICATE', 'duplicate frame file: ' + file)
    }
    seen.add(file.toLowerCase())
    const match = FRAME_FILE.exec(file)
    if (!match) continue
    const prefix = match[1]
    const index = Number(match[2])
    if (!Number.isSafeInteger(index) || index < 0 || index > 1_000_000) {
      fail('DYBERPET_FRAME_INDEX_INVALID', 'frame index is invalid: ' + file)
    }
    if (!inventory.has(prefix)) inventory.set(prefix, [])
    inventory.get(prefix).push({ file: 'action/' + file, index })
  }
  for (const frames of inventory.values()) {
    frames.sort((a, b) => a.index - b.index)
    for (let i = 1; i < frames.length; i++) {
      if (frames[i - 1].index === frames[i].index) {
        fail('DYBERPET_FRAME_DUPLICATE', 'duplicate numeric frame index')
      }
    }
  }
  return inventory
}

function actionReferences(petConfig) {
  const refs = {
    idle: petConfig.default,
    left: petConfig.left ?? null,
    right: petConfig.right ?? null,
    up: petConfig.up ?? null,
    down: petConfig.down ?? null,
    drag: petConfig.drag ?? null,
    fall: petConfig.fall ?? null,
    focus: petConfig.focus ?? null,
  }
  const patpat = petConfig.patpat
  if (typeof patpat === 'string') {
    refs.patpat = patpat
  } else if (patpat && typeof patpat === 'object' && !Array.isArray(patpat)) {
    refs.patpatByTier = {}
    for (const [tier, action] of Object.entries(patpat)) {
      if (!/^[0-3]$/u.test(tier) || typeof action !== 'string') {
        fail('DYBERPET_PATPAT_INVALID', 'patpat tier mapping is invalid')
      }
      refs.patpatByTier[tier] = action
    }
  }
  return refs
}

/**
 * Validate and normalize the documented DyberPet native role format.
 * This module deliberately reads metadata only; the caller owns image loading
 * and must not infer missing frames or fabricate replacement artwork.
 */
export function compileDyberPetMotionCatalog({ petConfig, actConfig, frameFiles } = {}) {
  if (!petConfig || typeof petConfig !== 'object' || Array.isArray(petConfig)
      || !actConfig || typeof actConfig !== 'object' || Array.isArray(actConfig)) {
    fail('DYBERPET_CONFIG_INVALID', 'pet_conf.json and act_conf.json must be JSON objects')
  }
  const actEntries = Object.entries(actConfig)
  if (!actEntries.length || actEntries.length > MAX_ACTIONS) {
    fail('DYBERPET_ACTION_COUNT_INVALID', 'action count is outside the supported range')
  }
  const inventory = frameInventory(frameFiles)
  const actions = {}

  for (const [id, raw] of actEntries) {
    if (!ACTION_ID.test(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
      fail('DYBERPET_ACTION_INVALID', 'action id or definition is invalid')
    }
    const prefix = raw.images
    if (typeof prefix !== 'string' || !FRAME_PREFIX.test(prefix)) {
      fail('DYBERPET_PREFIX_INVALID', 'action ' + id + ' has an invalid image prefix')
    }
    const frames = inventory.get(prefix) || []
    if (!frames.length) {
      // Unreferenced optional actions may be omitted, but referenced actions
      // are checked below and fail with a clearer binding error.
      continue
    }
    const repeats = finiteNumber(raw.act_num, 1, 1, MAX_REPEATS,
      'DYBERPET_REPEAT_INVALID', id + '.act_num')
    if (!Number.isInteger(repeats)) {
      fail('DYBERPET_REPEAT_INVALID', id + '.act_num must be an integer')
    }
    const frameSeconds = finiteNumber(raw.frame_refresh, 0.5, MIN_FRAME_MS / 1000, MAX_FRAME_MS / 1000,
      'DYBERPET_FRAME_RATE_INVALID', id + '.frame_refresh')
    const frameIntervalMs = Math.round(frameSeconds * 1000)
    const needMove = raw.need_move === true
    const direction = raw.direction ?? null
    if (needMove && !DIRECTIONS.has(direction)) {
      fail('DYBERPET_DIRECTION_INVALID', id + ' requires a supported movement direction')
    }
    const frameMove = finiteNumber(raw.frame_move, 10, 0, 200,
      'DYBERPET_FRAME_MOVE_INVALID', id + '.frame_move')
    const anchor = raw.anchor ?? [0, 0]
    if (!Array.isArray(anchor) || anchor.length !== 2
        || anchor.some(value => !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 4096)) {
      fail('DYBERPET_ANCHOR_INVALID', id + '.anchor must contain two finite bounded coordinates')
    }
    const durationMs = frames.length * repeats * frameIntervalMs
    if (durationMs > MAX_ACTION_MS) {
      fail('DYBERPET_ACTION_DURATION_INVALID', id + ' exceeds the maximum action duration')
    }
    actions[id] = {
      id,
      prefix,
      frames: frames.map(frame => frame.file),
      frameIndices: frames.map(frame => frame.index),
      frameCount: frames.length,
      repeats,
      frameIntervalMs,
      durationMs,
      needMove,
      direction: needMove ? direction : null,
      frameMove: needMove ? frameMove : 0,
      anchor: anchor.map(Number),
    }
  }

  const refs = actionReferences(petConfig)
  for (const [binding, id] of Object.entries(refs)) {
    if (binding === 'patpatByTier') {
      for (const [tier, actionId] of Object.entries(id)) {
        if (!actions[actionId]) fail('DYBERPET_ACTION_REFERENCE_MISSING', 'patpat tier ' + tier + ' references missing action ' + actionId)
      }
    } else if (id !== null && (typeof id !== 'string' || !actions[id])) {
      fail('DYBERPET_ACTION_REFERENCE_MISSING', binding + ' references missing action ' + String(id))
    }
  }
  if (!refs.idle) fail('DYBERPET_DEFAULT_ACTION_MISSING', 'pet_conf.json must define a default action')

  const randomActs = []
  const rawRandomActs = petConfig.random_act ?? []
  if (!Array.isArray(rawRandomActs) || rawRandomActs.length > MAX_ACTIONS) {
    fail('DYBERPET_RANDOM_ACT_INVALID', 'random_act must be a bounded array')
  }
  for (const item of rawRandomActs) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.name !== 'string' || !item.name.trim()
        || !Array.isArray(item.act_list) || !item.act_list.length || item.act_list.length > 16) {
      fail('DYBERPET_RANDOM_ACT_INVALID', 'random action definition is invalid')
    }
    const probability = finiteNumber(item.act_prob, 0, 0, 1,
      'DYBERPET_RANDOM_PROBABILITY_INVALID', 'random_act.act_prob')
    const actType = item.act_type ?? [0, 0]
    if (!Array.isArray(actType) || actType.length !== 2
        || actType.some(value => !Number.isInteger(value) || value < 0 || value > 10_000)) {
      fail('DYBERPET_RANDOM_TYPE_INVALID', 'random_act.act_type must contain two bounded integers')
    }
    for (const actionId of item.act_list) {
      if (typeof actionId !== 'string' || !actions[actionId]) {
        fail('DYBERPET_ACTION_REFERENCE_MISSING', 'random action references missing action ' + String(actionId))
      }
    }
    randomActs.push({
      name: item.name.trim().slice(0, 80),
      actions: [...item.act_list],
      probability,
      type: [...actType],
    })
  }

  return {
    schema: 'dsh.dyberpet-motion/1',
    sourceFormat: 'DyberPet native pet_conf.json + act_conf.json',
    defaultAction: refs.idle,
    bindings: refs,
    actions,
    randomActs,
  }
}

export function frameAtElapsedMs(action, elapsedMs, { loop = false } = {}) {
  if (!action || !Array.isArray(action.frames) || !action.frames.length
      || !Number.isFinite(Number(elapsedMs)) || Number(elapsedMs) < 0
      || !Number.isFinite(action.frameIntervalMs) || action.frameIntervalMs < MIN_FRAME_MS
      || !Number.isInteger(action.repeats) || action.repeats < 1) {
    fail('DYBERPET_PLAYBACK_INPUT_INVALID', 'invalid action playback input')
  }
  const totalFrames = action.frames.length * action.repeats
  const durationMs = totalFrames * action.frameIntervalMs
  const elapsed = Number(elapsedMs)
  const complete = !loop && elapsed >= durationMs
  const effective = loop ? elapsed % durationMs : Math.min(elapsed, Math.max(0, durationMs - 1))
  const playbackIndex = Math.min(totalFrames - 1, Math.floor(effective / action.frameIntervalMs))
  return {
    frameIndex: playbackIndex % action.frames.length,
    frame: action.frames[playbackIndex % action.frames.length],
    cycle: Math.floor(playbackIndex / action.frames.length),
    complete,
  }
}
