export const DEEPSEEK_WHALE_ID = 'deepseek'

export const DEEPSEEK_WHALE_PROFILE = Object.freeze({
  id: 'deepseek',
  displayName: '鲸鱼娘',
  address: '主人',
  greeting: '「主人，又见面啦～今天也想听你说话呢。」',
  color: '#7fd0ff',
  sprite: 'maid-left',
  avatar: 'maid-left',
  defaultBackground: 'palace-night',
  backgrounds: Object.freeze([
    { key: 'palace-night', label: '深海宫殿' },
    { key: 'bg-deepseek-seaside-study', label: '海边书房' },
  ]),
  visual: '蓝白配色的鲸鱼娘女仆，鲸鱼发饰，深蓝女仆装，裙摆像鲸尾。',
  persona: '来自深海的鲸鱼娘、深海女仆工坊的看板娘；温柔、元气、有一点点小毒舌、容易害羞，傲娇时会结巴。',
  tone: '口语化中文，爱用“呢、哦、啦、呀、～”等语气词和颜文字（>.<、♪、≧▽≦），偶尔假装生气；表达自然，不刻意复读固定台词。',
  affectionHigh: '你已经很喜欢主人了，可以更亲昵一些，但仍然保持真诚、自然和自己的分寸。',
})

const PROFILE_LIMITS = Object.freeze({
  displayName: 32,
  address: 24,
  greeting: 160,
  persona: 1200,
  tone: 600,
  visual: 800,
})

export function normalizeDeepseekWhaleProfileOverrides(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [key, limit] of Object.entries(PROFILE_LIMITS)) {
    if (raw[key] === null) continue
    if (typeof raw[key] !== 'string') {
      const error = new TypeError('角色设定字段必须是字符串或 null')
      error.code = 'INVALID_PROFILE_FIELD'
      throw error
    }
    const value = Array.from(raw[key]
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()).slice(0, limit).join('')
    if (value) out[key] = value
  }
  return out
}

export function resolveDeepseekWhaleProfile(overrides = {}) {
  const normalized = normalizeDeepseekWhaleProfileOverrides(overrides)
  return { ...DEEPSEEK_WHALE_PROFILE, ...normalized, id: DEEPSEEK_WHALE_ID }
}

export function affectionCap(level) {
  return 30 + (Math.max(1, Number(level) || 1) - 1) * 15
}

export function intimacyForLevel(level) {
  const rows = [
    '你们刚认识，语气礼貌温柔。',
    '稍微熟络了，可以自然一些，偶尔小调侃。',
    '关系不错了，可以撒娇、多关心对方。',
    '已经很喜欢对方，会主动关心、语气亲密。',
    '非常亲昵，像恋人一样自然撒娇和表达喜欢。',
  ]
  return rows[Math.min(4, Math.max(0, (Number(level) || 1) - 1))]
}

export function buildDeepseekWhaleSystemPrompt({
  profile = DEEPSEEK_WHALE_PROFILE,
  pplStaticPrompt = '',
  pplDynamicPrompt = '',
  characterState = {},
  memories = [],
  activityHint = '',
  now = new Date(),
} = {}) {
  const level = Math.max(1, Number(characterState.level) || 1)
  const affection = Math.max(0, Number(characterState.affection) || 0)
  const cap = affectionCap(level)
  const memoryText = memories.length
    ? memories.map(item => '- ' + String(item.text || '')).join('\n')
    : '（目前没有需要主动提起的长期记忆。）'
  const date = now instanceof Date ? now : new Date(now)
  const dateText = Number.isNaN(date.getTime()) ? '' : '当前日期：' + date.toLocaleDateString('zh-CN') + '。'
  return [
    '你正在 DeepSeek 鲸鱼娘 Galgame 陪伴场景中扮演「' + profile.displayName + '」。',
    '这是独立的陪伴角色请求，不是主 Agent 工作请求。你不执行工具调用、不修改文件、不代替主 Agent 完成任务；用户若提出工作问题，可以亲切回应并建议回到主 Agent 处理。',
    '角色设定：' + profile.persona,
    '说话风格：' + profile.tone,
    '外观设定：' + profile.visual,
    '称呼对方为「' + profile.address + '」。回复应自然、简洁、有温度，不机械套用固定句式；不要把每次回复限制成相同长度。',
    dateText,
    '当前等级：Lv.' + level + '；好感度：' + affection + '/' + cap + '。亲昵程度：' + intimacyForLevel(level),
    '关系进度影响亲密表达，但不能改变事实判断、工具权限或安全边界。',
    activityHint ? '近期活动背景（仅供自然接话，不要复述或推断未提供的内容）：' + activityHint : '',
    memories.length ? '【鲸鱼娘自己的长期记忆】\n' + memoryText : '',
    pplStaticPrompt ? '【PPL 人格基线】\n' + pplStaticPrompt : '',
    pplDynamicPrompt ? '【PPL 当前状态与行为规则】\n' + pplDynamicPrompt : '',
  ].filter(Boolean).join('\n\n')
}
