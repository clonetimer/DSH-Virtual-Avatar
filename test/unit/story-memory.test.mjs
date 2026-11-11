import test from 'node:test'
import assert from 'node:assert/strict'
import { addConfirmedStoryFact, appendStoryEvent, createStoryMemory, renderStoryContinuity, updateStorySummary } from '../../src/characters/deepseek-whale/story-memory.mjs'

test('confirmed companion facts require explicit stable sources and deduplicate idempotently', () => {
  let state = createStoryMemory()
  assert.throws(() => addConfirmedStoryFact(state, { text: '生日是五月' }), /stable fact id/)
  const first = addConfirmedStoryFact(state, { id: 'fact-1', text: '主人生日是五月', sourceEventId: 'user-confirm-1' })
  assert.equal(first.duplicate, false)
  const duplicate = addConfirmedStoryFact(first.storyMemory, { id: 'fact-1', text: '主人生日是五月', sourceEventId: 'user-confirm-1' })
  assert.equal(duplicate.duplicate, true)
  assert.throws(() => addConfirmedStoryFact(first.storyMemory, { id: 'fact-1', text: '别的内容', sourceEventId: 'user-confirm-1' }), { code: 'MEMORY_FACT_CONFLICT' })
})

test('shared experiences and long-term summary are revisioned and rendered into prompt context', () => {
  let state = createStoryMemory()
  state = appendStoryEvent(state, { id: 'event-1', title: '第一次海边约会', detail: '一起看了夜景', sourceEventId: 'turn-1' }).storyMemory
  state = updateStorySummary(state, { summary: '主人和鲸鱼娘已经一起去过海边。', expectedRevision: state.revision })
  const prompt = renderStoryContinuity(state)
  assert.match(prompt, /长期相处摘要/)
  assert.match(prompt, /第一次海边约会/)
  assert.throws(() => updateStorySummary(state, { summary: '过期更新', expectedRevision: 0 }), { code: 'REVISION_CONFLICT' })
})
