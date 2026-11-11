import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

const h = React.createElement
const API = '/api/dsh-virtual-avatar'

const CSS = `
.dva-root{--dva-ink:#18324a;--dva-blue:#5db7e8;--dva-pale:#eaf7ff;--dva-line:#d9e9f4;color:var(--dva-ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;width:100%;min-height:100%;box-sizing:border-box}
.dva-root *{box-sizing:border-box}
.dva-shell{max-width:980px;margin:0 auto;border:1px solid var(--dva-line);border-radius:18px;overflow:hidden;background:#f7fbff;box-shadow:0 8px 32px rgba(27,83,120,.08)}
.dva-hero{position:relative;min-height:210px;padding:22px 24px;display:flex;align-items:center;gap:22px;background:linear-gradient(115deg,rgba(232,248,255,.96),rgba(205,235,250,.88)),url('/api/dsh-virtual-avatar/assets/palace-night.webp') center/cover}
.dva-portrait{width:132px;height:176px;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 8px 12px rgba(29,85,122,.18));flex:0 0 auto}
.dva-hero-copy{min-width:0;flex:1}
.dva-title{font-size:23px;font-weight:750;letter-spacing:.02em;margin:0 0 5px}
.dva-subtitle{color:#54748b;font-size:13px;margin-bottom:14px}
.dva-stats{display:flex;gap:8px;flex-wrap:wrap}
.dva-stat{background:rgba(255,255,255,.82);border:1px solid rgba(119,174,207,.32);border-radius:999px;padding:5px 11px;font-size:12px}
.dva-stat b{font-variant-numeric:tabular-nums}
.dva-chat{padding:18px 20px 12px;background:rgba(255,255,255,.94)}
.dva-lines{height:340px;overflow:auto;padding:4px 4px 16px;display:flex;flex-direction:column;gap:12px}
.dva-line{max-width:82%;padding:10px 13px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}
.dva-line.user{align-self:flex-end;background:#dff2ff;border-bottom-right-radius:4px}
.dva-line.heroine{align-self:flex-start;background:#f0f7fb;border:1px solid #e2edf4;border-bottom-left-radius:4px}
.dva-line.narrator{align-self:center;background:transparent;color:#7891a3;font-size:12px;text-align:center;padding:3px 8px}
.dva-line small{display:block;color:#7a98aa;font-size:10px;margin-bottom:3px}
.dva-choices{display:flex;gap:8px;flex-wrap:wrap;padding:6px 0 12px}
.dva-choice{border:1px solid #b8d9ed;background:#f5fbff;color:#28506c;border-radius:999px;padding:7px 12px;cursor:pointer}
.dva-choice:hover{background:#e5f5ff}
.dva-form{display:flex;gap:8px;border-top:1px solid var(--dva-line);padding-top:12px}
.dva-input{flex:1;min-width:0;border:1px solid #c9dce9;border-radius:12px;padding:11px 13px;font:inherit;background:white;color:inherit}
.dva-button{border:0;border-radius:12px;padding:10px 17px;background:#4ca9dc;color:white;font-weight:650;cursor:pointer}
.dva-button:disabled{opacity:.5;cursor:default}
.dva-error{color:#a33c4a;padding:8px 0;font-size:12px}
.dva-foot{padding:0 20px 14px;background:white;color:#7891a3;font-size:11px}
.dva-settings{padding:18px;background:white;border:1px solid var(--dva-line);border-radius:16px;color:var(--dva-ink)}
.dva-settings h3{margin:0 0 12px;font-size:16px}
.dva-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.dva-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#5a778d}
.dva-field input,.dva-field textarea{border:1px solid #cbdce8;border-radius:9px;padding:8px 10px;font:inherit;color:#18324a;background:#fff}
.dva-field textarea{min-height:76px;resize:vertical}
.dva-memory-list{display:flex;flex-direction:column;gap:7px;margin:12px 0}
.dva-memory{display:flex;align-items:flex-start;gap:8px;padding:9px;border:1px solid #e1edf4;border-radius:10px;background:#f8fcff}
.dva-memory-text{flex:1;min-width:0;overflow-wrap:anywhere}
.dva-mini{font-size:11px;border:1px solid #c8dce9;background:white;color:#315a75;border-radius:8px;padding:4px 8px;cursor:pointer}
.dva-pet{position:fixed;z-index:9999;right:22px;bottom:22px}
.dva-pet-button{width:64px;height:64px;border-radius:50%;border:1px solid #b8d9ed;background:#e7f6ff;box-shadow:0 5px 18px rgba(24,75,110,.2);cursor:pointer;overflow:hidden}
.dva-pet-button img{width:100%;height:100%;object-fit:contain}
.dva-pet-panel{position:absolute;right:0;bottom:76px;width:min(520px,calc(100vw - 28px));max-height:80vh;overflow:auto;border-radius:16px;box-shadow:0 12px 36px rgba(12,45,70,.24)}
.dva-pet-close{position:absolute;right:12px;top:12px;z-index:2;border:0;border-radius:50%;width:28px;height:28px;background:rgba(255,255,255,.9);cursor:pointer}
@media(max-width:620px){.dva-hero{padding:14px;min-height:160px;gap:10px}.dva-portrait{width:92px;height:140px}.dva-title{font-size:19px}.dva-lines{height:48vh}.dva-settings-grid{grid-template-columns:1fr}.dva-line{max-width:94%}}
`

async function api(action, args = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
  })
  const result = await response.json()
  if (!response.ok || result.ok === false) throw new Error(result.error || '请求失败')
  return result
}

function newEventId() {
  try { return globalThis.crypto.randomUUID() } catch { return 'whale-' + Date.now() + '-' + Math.random().toString(36).slice(2) }
}

function currentExpression(character) {
  const last = [...(character?.chatLines || [])].reverse().find(line => line.who === 'heroine')
  const emotion = last?.emotion || 'normal'
  return character?.expressionUrls?.[emotion] || character?.imageUrl
}

function CharacterHeader({ character }) {
  return h('div', { className: 'dva-hero', style: { backgroundImage: 'linear-gradient(115deg,rgba(232,248,255,.96),rgba(205,235,250,.88)),url(' + character.backgroundUrl + ')' } },
    h('img', { className: 'dva-portrait', src: currentExpression(character), alt: 'DeepSeek 鲸鱼娘' }),
    h('div', { className: 'dva-hero-copy' },
      h('h2', { className: 'dva-title' }, character.name || 'DeepSeek 鲸鱼娘'),
      h('div', { className: 'dva-subtitle' }, '深海女仆工坊 · 今天也来陪主人聊天啦'),
      h('div', { className: 'dva-stats' },
        h('span', { className: 'dva-stat' }, 'Lv.', h('b', null, character.level)),
        h('span', { className: 'dva-stat' }, '好感 ', h('b', null, character.affection + '/' + character.affectionCap)),
        h('span', { className: 'dva-stat' }, '信任 ', h('b', null, Math.round((character.relationship?.trust || 0) * 100) + '%')),
        h('span', { className: 'dva-stat' }, '关系 ', h('b', null, character.relationship?.stage || 'acquaintance')),
      ),
    ),
  )
}

function AvatarApp({ compact = false }) {
  const [view, setView] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lineEnd = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const result = await api('view')
      setView(result)
      setError('')
    } catch (failure) {
      setError(failure.message)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { lineEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [view?.character?.chatLines?.length])

  const send = useCallback(async (text, choiceId = null) => {
    const message = String(text || '').trim()
    if (!message || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api('chat', {
        text: message,
        choiceId,
        eventId: newEventId(),
        sessionId: 'deepseek-whale-default',
      })
      setView(result.view)
      setDraft('')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }, [busy])

  if (!view) return h('div', { className: 'dva-root' }, h('div', { className: 'dva-settings' }, error || '正在唤醒鲸鱼娘……'))
  const character = view.character
  const lines = character.chatLines || []
  return h('div', { className: 'dva-root' },
    h('div', { className: 'dva-shell' },
      h(CharacterHeader, { character }),
      h('div', { className: 'dva-chat' },
        h('div', { className: 'dva-lines' },
          lines.length
            ? lines.slice(-80).map((line, index) => h('div', {
                key: String(line.at || index) + '-' + index,
                className: 'dva-line ' + (line.who === 'user' ? 'user' : line.who === 'narrator' ? 'narrator' : 'heroine'),
              },
                line.who !== 'narrator' ? h('small', null, line.who === 'user' ? '主人' : '鲸鱼娘') : null,
                line.text,
              ))
            : h('div', { className: 'dva-line heroine' },
                h('small', null, '鲸鱼娘'),
                '主人，欢迎回来！今天想和我聊些什么呢？♪',
              ),
          h('div', { ref: lineEnd }),
        ),
        character.choices?.length
          ? h('div', { className: 'dva-choices' },
              character.choices.map(choice => h('button', {
                key: choice.id,
                className: 'dva-choice',
                disabled: busy,
                onClick: () => send(choice.text, choice.id),
              }, choice.text)),
            )
          : null,
        h('form', { className: 'dva-form', onSubmit: event => { event.preventDefault(); send(draft) } },
          h('input', {
            className: 'dva-input',
            value: draft,
            onChange: event => setDraft(event.target.value),
            placeholder: '和鲸鱼娘说点什么……',
            disabled: busy,
            maxLength: 500,
          }),
          h('button', { className: 'dva-button', type: 'submit', disabled: busy || !draft.trim() }, busy ? '思考中…' : '发送'),
        ),
        error ? h('div', { className: 'dva-error' }, error) : null,
      ),
      h('div', { className: 'dva-foot' }, '好感度、关系与记忆会在对话成功完成后保存。'),
    ),
  )
}

function SettingsPanel() {
  const [profile, setProfile] = useState(null)
  const [memories, setMemories] = useState([])
  const [memoryText, setMemoryText] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api('profile-get'), api('memory-list')])
      setProfile(p.profile)
      setMemories(m.memories || [])
    } catch (error) { setStatus(error.message) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const saveProfile = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api('profile-set', { profile })
      setProfile(result.profile)
      setStatus('角色设定已保存')
    } catch (error) { setStatus(error.message) }
    finally { setBusy(false) }
  }

  const addMemory = async event => {
    event.preventDefault()
    if (!memoryText.trim()) return
    setBusy(true)
    try {
      await api('memory-add', { text: memoryText, eventId: newEventId() })
      setMemoryText('')
      await refresh()
      setStatus('已记入鲸鱼娘的长期记忆')
    } catch (error) { setStatus(error.message) }
    finally { setBusy(false) }
  }

  const memoryAction = async (action, memory) => {
    setBusy(true)
    try {
      await api(action, { memoryId: memory.id, pinned: !memory.pinned })
      await refresh()
    } catch (error) { setStatus(error.message) }
    finally { setBusy(false) }
  }

  if (!profile) return h('div', { className: 'dva-settings' }, status || '正在读取鲸鱼娘设定……')
  const field = (key, label, multiline = false) => h('label', { className: 'dva-field', key },
    label,
    multiline
      ? h('textarea', { value: profile[key] || '', onChange: event => setProfile(current => ({ ...current, [key]: event.target.value })) })
      : h('input', { value: profile[key] || '', onChange: event => setProfile(current => ({ ...current, [key]: event.target.value })) }),
  )

  return h('div', { className: 'dva-root' },
    h('div', { className: 'dva-settings' },
      h('h3', null, 'DeepSeek 鲸鱼娘 · 角色设定'),
      h('form', { onSubmit: saveProfile },
        h('div', { className: 'dva-settings-grid' },
          field('displayName', '角色显示名称'),
          field('address', '对主人的称呼'),
          field('greeting', '初次问候', true),
          field('persona', '性格设定', true),
          field('tone', '说话风格', true),
          field('visual', '外观描述', true),
        ),
        h('div', { style: { marginTop: 12 } }, h('button', { className: 'dva-button', type: 'submit', disabled: busy }, '保存设定')),
      ),
      h('hr', { style: { border: 0, borderTop: '1px solid #e1edf4', margin: '18px 0' } }),
      h('h3', null, '鲸鱼娘的长期记忆'),
      h('form', { className: 'dva-form', onSubmit: addMemory },
        h('input', { className: 'dva-input', value: memoryText, onChange: event => setMemoryText(event.target.value), placeholder: '明确告诉鲸鱼娘要记住的事情……', maxLength: 400 }),
        h('button', { className: 'dva-button', type: 'submit', disabled: busy || !memoryText.trim() }, '记住'),
      ),
      h('div', { className: 'dva-memory-list' },
        memories.map(memory => h('div', { className: 'dva-memory', key: memory.id },
          h('div', { className: 'dva-memory-text' },
            memory.text,
            h('div', { style: { color: '#8098a8', fontSize: 10, marginTop: 3 } }, memory.pinned ? '已置顶 · 核心记忆' : memory.level === 'mid' ? '重复提及' : '普通记忆'),
          ),
          h('button', { className: 'dva-mini', disabled: busy, onClick: () => memoryAction('memory-pin', memory) }, memory.pinned ? '取消置顶' : '置顶'),
          h('button', { className: 'dva-mini', disabled: busy, onClick: () => memoryAction('memory-delete', memory) }, '删除'),
        )),
      ),
      status ? h('div', { className: 'dva-error' }, status) : null,
    ),
  )
}

function PetOverlay() {
  const [open, setOpen] = useState(false)
  return h('div', { className: 'dva-pet' },
    open ? h('div', { className: 'dva-pet-panel' },
      h('button', { className: 'dva-pet-close', onClick: () => setOpen(false) }, '×'),
      h(AvatarApp, { compact: true }),
    ) : null,
    h('button', { className: 'dva-pet-button', title: '打开 DeepSeek 鲸鱼娘', onClick: () => setOpen(value => !value) },
      h('img', { src: API + '/assets/maid-left.webp', alt: '鲸鱼娘桌宠' }),
    ),
  )
}

export function apply(ctx) {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-virtual-avatar'
  style.textContent = CSS
  document.head.appendChild(style)

  const slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : null)
  if (!slots || typeof slots.inject !== 'function') {
    const host = document.createElement('div')
    host.dataset.plugin = 'dsh-virtual-avatar'
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(h(AvatarApp))
    ctx.effect?.(() => () => { root.unmount(); host.remove(); style.remove() }, 'dsh-virtual-avatar: fallback mount')
    return
  }

  slots.inject('conversation.view', () => slots.register(
    { name: 'conversation.view', id: 'deepseek-whale', order: 120, label: '鲸鱼娘' },
    () => h(AvatarApp),
  ))

  slots.inject('settings.plugins.tab', () => slots.register(
    { name: 'settings.plugins.tab', id: 'dsh-virtual-avatar', order: 24, label: '虚拟陪伴' },
    () => h(SettingsPanel),
  ))

  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'deepseek-whale-pet', order: 920 },
    () => h(PetOverlay),
  ))

  ctx.effect?.(() => () => style.remove(), 'dsh-virtual-avatar: client styles')
}
