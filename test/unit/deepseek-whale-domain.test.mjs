import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEEPSEEK_WHALE_PROFILE,
  buildDeepseekWhaleSystemPrompt,
  resolveDeepseekWhaleProfile,
  affectionCap,
} from '../../src/characters/deepseek-whale/profile.mjs'
import {
  applyDeepseekWhaleAffection,
  classifyDeepseekWhaleEvent,
  createDeepseekWhaleInitialState,
  deepseekWhaleAffectionDelta,
} from '../../src/characters/deepseek-whale/relationship.mjs'

test('DeepSeek Whale profile is scoped to the companion character', () => {
  assert.equal(DEEPSEEK_WHALE_PROFILE.id, 'deepseek')
  const profile = resolveDeepseekWhaleProfile({ displayName: '小鲸鱼', address: '主人' })
  assert.equal(profile.displayName, '小鲸鱼')
  assert.equal(profile.address, '主人')
  assert.equal(profile.visual, DEEPSEEK_WHALE_PROFILE.visual)
  assert.throws(() => resolveDeepseekWhaleProfile({ tone: 42 }), { code: 'INVALID_PROFILE_FIELD' })
})

test('companion prompt carries level, memory and PPL state without becoming an Agent prompt', () => {
  const prompt = buildDeepseekWhaleSystemPrompt({
    characterState: { level: 3, affection: 12 },
    memories: [{ text: '主人喜欢海边的夜景' }],
    pplStaticPrompt: 'PPL static',
    pplDynamicPrompt: 'PPL dynamic',
    now: new Date('2026-11-11T00:00:00Z'),
  })
  assert.match(prompt, /DeepSeek 鲸鱼娘/)
  assert.match(prompt, /Lv.3/)
  assert.match(prompt, /12\/60/)
  assert.match(prompt, /主人喜欢海边的夜景/)
  assert.match(prompt, /PPL static/)
  assert.match(prompt, /日常陪伴对话场景/)
  assert.doesNotMatch(prompt, /Galgame/)
})

test('Whale affection progression retains the upstream cap and carry-over semantics', () => {
  assert.equal(affectionCap(1), 30)
  assert.equal(affectionCap(2), 45)
  const state = createDeepseekWhaleInitialState()
  const result = applyDeepseekWhaleAffection({ ...state, affection: 29 }, { delta: 1 })
  assert.equal(result.state.level, 2)
  assert.equal(result.state.affection, 0)
  assert.deepEqual(result.levelUps, [{ level: 2, consumed: 30 }])
})

test('event classification uses companion semantics for comfort and confession', () => {
  assert.equal(classifyDeepseekWhaleEvent({ text: '今天辛苦了', eventId: '1' }).type, 'COMFORT')
  assert.equal(classifyDeepseekWhaleEvent({ text: '我喜欢你', eventId: '2' }).type, 'CONFESSION')
  assert.equal(classifyDeepseekWhaleEvent({ text: '普通聊天', eventId: '3' }).source, 'companion')
  assert.equal(deepseekWhaleAffectionDelta({ text: '我喜欢你' }), 1)
})
