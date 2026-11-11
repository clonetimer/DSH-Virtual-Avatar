import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseStoryBranch, createStoryRun, DEEPSEEK_WHALE_INTRO_STORY, getStoryNode, validateStoryDefinition } from '../../src/characters/deepseek-whale/story-engine.mjs'

test('DeepSeek Whale intro story validates and offers meaningful branches', () => {
  assert.equal(validateStoryDefinition(DEEPSEEK_WHALE_INTRO_STORY), true)
  const run = createStoryRun({ storyId: DEEPSEEK_WHALE_INTRO_STORY.id, startNode: 'intro' })
  const node = getStoryNode(DEEPSEEK_WHALE_INTRO_STORY, run)
  assert.equal(node.choices.length, 3)
  assert.match(node.text, /主人/)
})

test('story choice changes node, records effects and is idempotent', () => {
  const run = createStoryRun({ storyId: DEEPSEEK_WHALE_INTRO_STORY.id, startNode: 'intro' })
  const result = chooseStoryBranch(DEEPSEEK_WHALE_INTRO_STORY, run, { choiceId: 'tea', eventId: 'story-turn-1' })
  assert.equal(result.run.currentNode, 'tea')
  assert.equal(result.run.variables.affection, 1)
  assert.equal(result.run.variables.trust, 1)
  assert.equal(result.run.choiceHistory.length, 1)
  const duplicate = chooseStoryBranch(DEEPSEEK_WHALE_INTRO_STORY, result.run, { choiceId: 'tea', eventId: 'story-turn-1' })
  assert.equal(duplicate.duplicate, true)
  assert.throws(() => chooseStoryBranch(DEEPSEEK_WHALE_INTRO_STORY, result.run, { choiceId: 'quiet', eventId: 'story-turn-1' }), { code: 'STORY_EVENT_CONFLICT' })
})

test('invalid branch cannot jump to an unknown node', () => {
  const invalid = { id: 'bad', startNode: 'start', nodes: { start: { text: 'x', choices: [{ id: 'go', text: 'go', next: 'missing' }] } } }
  assert.throws(() => validateStoryDefinition(invalid), /invalid id\/text\/next node/)
})
