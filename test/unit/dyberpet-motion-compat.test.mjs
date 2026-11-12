import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  compileDyberPetMotionCatalog,
  frameAtElapsedMs,
} from '../../src/characters/deepseek-whale/dyberpet-motion.mjs'

const petConfig = {
  default: 'default',
  left: 'left_walk',
  right: 'right_walk',
  drag: 'drag',
  fall: 'fall',
  patpat: { 0: 'patpat', 1: 'patpat', 2: 'patpat', 3: 'patpat' },
  random_act: [
    { name: '左右行走', act_list: ['left_walk', 'right_walk', 'default'], act_prob: 0.1, act_type: [3, 1] },
  ],
}

const actConfig = {
  default: { images: 'stand', act_num: 1, frame_refresh: 0.5 },
  left_walk: { images: 'leftwalk', act_num: 2, need_move: true, direction: 'left', frame_move: 10, frame_refresh: 0.2 },
  right_walk: { images: 'rightwalk', act_num: 2, need_move: true, direction: 'right', frame_move: 10, frame_refresh: 0.2 },
  drag: { images: 'drag', act_num: 1 },
  fall: { images: 'fall', act_num: 1 },
  patpat: { images: 'patpat', act_num: 2, frame_refresh: 0.08 },
}

const frameFiles = [
  'action/stand_10.png',
  'action/stand_2.png',
  'action/stand_0.png',
  'action/leftwalk_1.png',
  'action/leftwalk_0.png',
  'action/rightwalk_0.png',
  'action/rightwalk_1.png',
  'action/drag_0.png',
  'action/fall_0.png',
  'action/patpat_0.png',
]

test('DyberPet native role config compiles to numerically ordered frame actions', () => {
  const catalog = compileDyberPetMotionCatalog({ petConfig, actConfig, frameFiles })

  assert.equal(catalog.schema, 'dsh.dyberpet-motion/1')
  assert.equal(catalog.sourceFormat, 'DyberPet native pet_conf.json + act_conf.json')
  assert.equal(catalog.defaultAction, 'default')
  assert.deepEqual(catalog.actions.default.frames, [
    'action/stand_0.png',
    'action/stand_2.png',
    'action/stand_10.png',
  ])
  assert.equal(catalog.actions.left_walk.frameIntervalMs, 200)
  assert.equal(catalog.actions.left_walk.durationMs, 800)
  assert.equal(catalog.actions.left_walk.direction, 'left')
  assert.equal(catalog.actions.drag.needMove, false)
  assert.deepEqual(catalog.bindings.patpatByTier, {
    0: 'patpat', 1: 'patpat', 2: 'patpat', 3: 'patpat',
  })
  assert.equal(catalog.randomActs[0].probability, 0.1)
})

test('DyberPet playback maps elapsed time across repeated frames and loops safely', () => {
  const catalog = compileDyberPetMotionCatalog({ petConfig, actConfig, frameFiles })
  const action = catalog.actions.left_walk

  assert.deepEqual(frameAtElapsedMs(action, 0), {
    frameIndex: 0, frame: 'action/leftwalk_0.png', cycle: 0, complete: false,
  })
  assert.deepEqual(frameAtElapsedMs(action, 200), {
    frameIndex: 1, frame: 'action/leftwalk_1.png', cycle: 0, complete: false,
  })
  assert.deepEqual(frameAtElapsedMs(action, 400), {
    frameIndex: 0, frame: 'action/leftwalk_0.png', cycle: 1, complete: false,
  })
  assert.equal(frameAtElapsedMs(action, 800).complete, true)
  assert.equal(frameAtElapsedMs(action, 800, { loop: true }).frameIndex, 0)
})

test('DyberPet native role validation rejects unsafe paths and missing referenced actions', () => {
  assert.throws(
    () => compileDyberPetMotionCatalog({ petConfig, actConfig, frameFiles: [...frameFiles, '../outside.png'] }),
    error => error.code === 'DYBERPET_FRAME_PATH_INVALID',
  )

  assert.throws(
    () => compileDyberPetMotionCatalog({
      petConfig: { ...petConfig, default: 'missing' },
      actConfig,
      frameFiles,
    }),
    error => error.code === 'DYBERPET_ACTION_REFERENCE_MISSING',
  )
})

test('DyberPet native role validation rejects invalid timing, movement and frame inventories', () => {
  assert.throws(
    () => compileDyberPetMotionCatalog({
      petConfig,
      actConfig: { ...actConfig, patpat: { images: 'patpat', frame_refresh: 0.001 } },
      frameFiles,
    }),
    error => error.code === 'DYBERPET_FRAME_RATE_INVALID',
  )

  assert.throws(
    () => compileDyberPetMotionCatalog({
      petConfig,
      actConfig: { ...actConfig, left_walk: { ...actConfig.left_walk, direction: 'diagonal' } },
      frameFiles,
    }),
    error => error.code === 'DYBERPET_DIRECTION_INVALID',
  )

  assert.throws(
    () => compileDyberPetMotionCatalog({ petConfig, actConfig, frameFiles: [] }),
    error => error.code === 'DYBERPET_ACTION_REFERENCE_MISSING',
  )
})
