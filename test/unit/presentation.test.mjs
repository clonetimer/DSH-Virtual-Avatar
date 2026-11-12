import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDeepseekWhalePresentation } from '../../src/characters/deepseek-whale/presentation.mjs'

test('baseline presentation keeps the original neutral portrait and current character labels', () => {
  const result = resolveDeepseekWhalePresentation({
    pplState: { fatigue: 0.1, embarrassment: 0.25, anxiety: 0.1, grief: 0.05, anger: 0.02 },
    replyEmotion: 'normal',
  })

  assert.equal(result.expression, 'neutral')
  assert.equal(result.asset, 'maid-left.webp')
  assert.equal(result.expressionSource, 'baseline')
  assert.equal(result.mood, '平静')
  assert.equal(result.shyness, '自然')
  assert.equal(result.motion, 'calm')
  assert.equal(result.tempo, 'normal')
})

test('persistent PPL embarrassment overrides a one-turn reply expression', () => {
  const result = resolveDeepseekWhalePresentation({
    pplState: { embarrassment: 0.76, anxiety: 0.1, grief: 0.05, anger: 0.02 },
    replyEmotion: 'cheerful',
  })

  assert.equal(result.expression, 'shy')
  assert.equal(result.asset, 'whale-shy.webp')
  assert.equal(result.expressionSource, 'ppl-state')
  assert.equal(result.expressionLabel, '很害羞')
  assert.equal(result.shyness, '很害羞')
  assert.equal(result.motion, 'shy')
})

test('PPL anger, grief and anxiety select their matching existing expression assets', () => {
  const angry = resolveDeepseekWhalePresentation({ pplState: { anger: 0.8 }, replyEmotion: 'cheerful' })
  const subdued = resolveDeepseekWhalePresentation({ pplState: { grief: 0.7 } })
  const nervous = resolveDeepseekWhalePresentation({ pplState: { anxiety: 0.75 } })

  assert.equal(angry.expression, 'angry')
  assert.equal(angry.asset, 'whale-angry.webp')
  assert.equal(angry.motion, 'tense')
  assert.equal(subdued.expression, 'serious')
  assert.equal(subdued.asset, 'whale-serious.webp')
  assert.equal(subdued.motion, 'subdued')
  assert.equal(nervous.expression, 'frightened')
  assert.equal(nervous.asset, 'whale-frightened.webp')
  assert.equal(nervous.motion, 'nervous')
})

test('strongest normalized PPL emotion wins deterministically when states overlap', () => {
  const result = resolveDeepseekWhalePresentation({
    pplState: { anger: 0.7, grief: 0.9, anxiety: 0.2, embarrassment: 0.1 },
  })
  assert.equal(result.expression, 'serious')
  assert.equal(result.expressionSource, 'ppl-state')
})

test('high character fatigue slows ambient motion without changing the expression', () => {
  const result = resolveDeepseekWhalePresentation({
    pplState: { fatigue: 0.9, embarrassment: 0.2 },
    replyEmotion: 'cheerful',
  })
  assert.equal(result.expression, 'cheerful')
  assert.equal(result.motion, 'resting')
  assert.equal(result.tempo, 'slow')
})

test('invalid and out-of-range PPL values are safely normalized', () => {
  const result = resolveDeepseekWhalePresentation({
    pplState: { anger: 5, grief: Number.NaN, anxiety: -2, embarrassment: Infinity, fatigue: 3 },
    replyEmotion: 'not-an-expression',
  })
  assert.equal(result.expression, 'angry')
  assert.equal(result.state.anger, 1)
  assert.equal(result.state.grief, 0)
  assert.equal(result.state.anxiety, 0)
  assert.equal(result.state.embarrassment, 0)
  assert.equal(result.state.fatigue, 1)
  assert.equal(result.tempo, 'slow')
})

test('patting feedback follows the current expression without changing PPL state', () => {
  const angry = resolveDeepseekWhalePresentation({ pplState: { anger: 0.8 } })
  const neutral = resolveDeepseekWhalePresentation({ pplState: { embarrassment: 0.1 } })

  assert.equal(angry.patExpression, 'angry')
  assert.equal(angry.patReply, '唔……主人轻一点啦。')
  assert.equal(neutral.patExpression, 'shy')
  assert.equal(neutral.patReply, '嘿嘿，主人摸摸我啦～')
})
