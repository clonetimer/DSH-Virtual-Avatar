const MAX_NODES = 100
const MAX_CHOICES = 4

function clean(value, limit = 240) {
  return String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function createStoryRun({ storyId = 'whale-main', startNode = 'intro' } = {}) {
  return {
    storyId,
    currentNode: startNode,
    status: 'active',
    variables: {},
    visitedNodes: [],
    choiceHistory: [],
    revision: 0,
    updatedAt: new Date().toISOString(),
  }
}

export function validateStoryDefinition(definition) {
  if (!definition || typeof definition !== 'object' || !definition.id || !definition.nodes || typeof definition.nodes !== 'object') {
    throw new TypeError('story definition requires id and nodes')
  }
  const nodeIds = new Set(Object.keys(definition.nodes))
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (!node || typeof node.text !== 'string' || !node.text.trim()) throw new TypeError('story node text required: ' + nodeId)
    if (!Array.isArray(node.choices) || node.choices.length > MAX_CHOICES) throw new TypeError('story node choices must be an array with at most four entries: ' + nodeId)
    for (const choice of node.choices) {
      if (!choice.id || !choice.text || !nodeIds.has(choice.next)) throw new TypeError('story choice has invalid id/text/next node: ' + nodeId)
      if (choice.effects && (!Number.isInteger(choice.effects.affection || 0) || ![-1,0,1].includes(choice.effects.affection || 0))) throw new TypeError('story choice affection effect must be -1, 0 or 1')
    }
  }
  if (!nodeIds.has(definition.startNode)) throw new TypeError('story startNode does not exist')
  return true
}

export function getStoryNode(definition, run) {
  validateStoryDefinition(definition)
  const node = definition.nodes[run?.currentNode]
  if (!node) throw new Error('current story node not found')
  return structuredClone({ id: run.currentNode, ...node })
}

export function chooseStoryBranch(definition, run, { choiceId, eventId, now = new Date().toISOString() } = {}) {
  validateStoryDefinition(definition)
  if (!eventId) throw new TypeError('story choice eventId required')
  if (!run || run.status !== 'active') throw new Error('story run is not active')
  const node = definition.nodes[run.currentNode]
  if (!node) throw new Error('current story node not found')
  const choice = node.choices.find(item => item.id === choiceId)
  if (!choice) {
    const error = new Error('choice is not available in current story node')
    error.code = 'INVALID_STORY_CHOICE'
    throw error
  }
  const duplicate = run.choiceHistory.find(item => item.eventId === eventId)
  if (duplicate) {
    if (duplicate.choiceId !== choiceId) {
      const error = new Error('story event id was reused for another choice')
      error.code = 'STORY_EVENT_CONFLICT'
      throw error
    }
    return { duplicate: true, run: structuredClone(run), choice: structuredClone(choice) }
  }
  const next = structuredClone(run)
  next.visitedNodes.push(next.currentNode)
  next.choiceHistory.push({ eventId, from: next.currentNode, choiceId, to: choice.next, selectedAt: now })
  next.choiceHistory = next.choiceHistory.slice(-MAX_NODES)
  for (const [key, value] of Object.entries(choice.effects || {})) {
    if (typeof value === 'number') next.variables[key] = (Number(next.variables[key]) || 0) + value
    else next.variables[key] = value
  }
  next.currentNode = choice.next
  next.status = definition.nodes[choice.next].ending ? 'completed' : 'active'
  next.revision += 1
  next.updatedAt = now
  return { duplicate: false, run: next, choice: structuredClone(choice), node: getStoryNode(definition, next) }
}

export const DEEPSEEK_WHALE_INTRO_STORY = Object.freeze({
  id: 'deepseek-whale-first-meeting',
  title: '深海女仆工坊的初次相遇',
  startNode: 'intro',
  nodes: {
    intro: {
      text: '深海女仆工坊的灯光柔和地亮着。鲸鱼娘听见脚步声，抬起头，蓝色的发梢轻轻晃动。“主人，欢迎回来！今天想先做些什么呢？”',
      scene: 'palace-night',
      emotion: 'cheerful',
      choices: [
        { id: 'talk', text: '坐下来聊聊今天发生的事', next: 'talk', effects: { affection: 1, warmth: 1 } },
        { id: 'tea', text: '请她一起喝杯茶', next: 'tea', effects: { affection: 1, trust: 1 } },
        { id: 'quiet', text: '先安静地陪伴一会儿', next: 'quiet', effects: { affection: 0, calm: 1 } },
      ],
    },
    talk: {
      text: '“嗯嗯，我在认真听哦！主人今天遇到了什么有趣的事吗？开心的事情也好，烦恼也好，都可以慢慢告诉我。”',
      scene: 'palace-night',
      emotion: 'cheerful',
      choices: [
        { id: 'share', text: '分享一件重要的事', next: 'promise', effects: { affection: 1, trust: 1 } },
        { id: 'ask', text: '问问她今天过得怎么样', next: 'bond', effects: { affection: 1 } },
      ],
    },
    tea: {
      text: '鲸鱼娘把茶杯轻轻放到主人面前，自己也坐在旁边。“这样一起休息，感觉时间都慢下来啦。”',
      scene: 'bg-deepseek-seaside-study',
      emotion: 'shy',
      choices: [
        { id: 'compliment', text: '夸夸她准备得很用心', next: 'bond', effects: { affection: 1, trust: 1 } },
        { id: 'continue', text: '继续聊聊喜欢的事情', next: 'talk', effects: { affection: 0 } },
      ],
    },
    quiet: {
      text: '鲸鱼娘没有打扰主人，只是安静地坐在身边。过了一会儿，她轻声说：“主人想说话的时候，我一直都在。”',
      scene: 'palace-night',
      emotion: 'shy',
      choices: [
        { id: 'thanks', text: '谢谢她的陪伴', next: 'bond', effects: { affection: 1 } },
        { id: 'later', text: '约好下次再聊', next: 'promise', effects: { affection: 0 } },
      ],
    },
    bond: {
      text: '鲸鱼娘开心地笑了起来。“能和主人分享这些小小的日常，我也觉得很幸福呢。”',
      scene: 'palace-night',
      emotion: 'cheerful',
      choices: [
        { id: 'remember', text: '把这段时光记下来', next: 'promise', effects: { affection: 1, memory: true } },
        { id: 'end', text: '今天就到这里吧', next: 'ending', effects: { affection: 0 } },
      ],
    },
    promise: {
      text: '“那我们约好了哦。以后也要继续分享生活里的故事。鲸鱼娘会好好记住这份约定的！”',
      scene: 'bg-deepseek-seaside-study',
      emotion: 'starry',
      choices: [
        { id: 'seal', text: '郑重地答应她', next: 'ending', effects: { affection: 1, promise: true } },
        { id: 'later', text: '留到下次继续这个话题', next: 'ending', effects: { affection: 0, promise: true } },
      ],
    },
    ending: {
      text: '夜色渐深，工坊的灯光依旧温暖。鲸鱼娘挥挥手：“主人，下次见面时，我们再继续今天的故事吧！”',
      scene: 'palace-night',
      emotion: 'cheerful',
      ending: true,
      choices: [],
    },
  },
})
