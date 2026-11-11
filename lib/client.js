import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const API = '/api/dsh-virtual-avatar'
const CSS = `
.dva-root{position:fixed;right:18px;bottom:104px;z-index:8999;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#eaf5ff}
.dva-pet{width:112px;height:132px;border:0;border-radius:18px;background:transparent;box-shadow:none;cursor:pointer;padding:0;filter:drop-shadow(0 8px 14px #00172b88);transition:transform .18s ease}.dva-pet:hover{transform:translateY(-5px) scale(1.035)}.dva-pet img{width:100%;height:100%;object-fit:contain}.dva-pet span{display:block;margin-top:-4px;padding:4px 8px;border:1px solid #8bcdf288;border-radius:999px;background:#092642dd;color:#eaf5ff;font-size:11px;text-align:center}
.dva-panel{position:fixed;inset:5vh 5vw;z-index:9000;display:flex;flex-direction:column;overflow:hidden;border:1px solid #6ea9cc;border-radius:20px;background:linear-gradient(160deg,#0b2340,#07172b 65%,#0b3152);box-shadow:0 24px 80px #000b;color:#eaf5ff}
.dva-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #ffffff22}
.dva-title{font-size:18px;font-weight:700}.dva-sub{font-size:12px;color:#a9c9df;margin-top:4px}
.dva-main{display:grid;grid-template-columns:minmax(180px,28%) 1fr;min-height:0;flex:1}
.dva-character{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse at center,#16466b,#091b30 70%)}
.dva-character img{width:min(100%,260px);max-height:56vh;object-fit:contain;filter:drop-shadow(0 12px 20px #0008)}
.dva-stats{font-size:13px;color:#b9d8ec;line-height:1.9;text-align:center}
.dva-chat{display:flex;flex-direction:column;min-width:0;min-height:0;padding:18px;gap:12px}
.dva-lines{overflow:auto;flex:1;display:flex;flex-direction:column;gap:10px;padding-right:6px}
.dva-line{max-width:88%;padding:10px 13px;border-radius:14px;background:#173b59;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.dva-line.user{align-self:flex-end;background:#23577a}.dva-line.heroine{align-self:flex-start}
.dva-choices{display:flex;gap:8px;flex-wrap:wrap}.dva-choices button,.dva-actions button,.dva-send{border:1px solid #77b8df;border-radius:999px;background:#174b70;color:#f2f9ff;padding:8px 13px;cursor:pointer}
.dva-input{display:flex;gap:8px}.dva-input input{flex:1;min-width:0;border:1px solid #4d7796;border-radius:12px;background:#06172a;color:#fff;padding:11px}
.dva-actions{display:flex;gap:8px;align-items:center}.dva-actions button:disabled,.dva-send:disabled{opacity:.45;cursor:wait}
.dva-memories{max-height:38vh;overflow:auto;font-size:12px;color:#c2dced;background:#0b2238;border:1px solid #ffffff22;border-radius:12px;padding:10px}.dva-memory-row{padding:6px 0;border-bottom:1px solid #ffffff18}.dva-memory-row button{margin:4px;border:1px solid #77b8df;border-radius:999px;background:#174b70;color:#f2f9ff;padding:4px 8px}.dva-error{color:#ffb5a9;font-size:12px}
@media(max-width:760px){.dva-panel{inset:2vh 2vw}.dva-main{grid-template-columns:1fr}.dva-character{display:none}.dva-chat{padding:12px}}
`

async function callApi(action, args = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
  })
  const result = await response.json()
  if (!response.ok || result.ok === false) throw new Error(result.error || '请求失败')
  return result
}

function Companion() {
  const [view, setView] = useState(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [memories, setMemories] = useState([])
  const [olderLines, setOlderLines] = useState([])
  const [historyCursor, setHistoryCursor] = useState(null)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [memoryCandidates, setMemoryCandidates] = useState([])
  const [showMemories, setShowMemories] = useState(false)
  const [storyMemory, setStoryMemory] = useState(null)
  const [showStory, setShowStory] = useState(false)
  const [summaryCandidate, setSummaryCandidate] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [profileDraft, setProfileDraft] = useState({})

  const refresh = useCallback(async () => {
    try {
      const result = await callApi('view')
      setView(result)
      setHistoryTotal(result.character?.chatLines?.length || 0)
      setOlderLines([])
      setHistoryCursor(null)
      setError('')
    } catch (err) { setError(err.message || String(err)) }
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const result = await callApi('view')
        if (active) setView(result)
      } catch (err) { if (active) setError(err.message || String(err)) }
    }
    void load()
    const timer = setInterval(() => { if (active && open) void load() }, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [open])

  const send = useCallback(async (message, choiceId) => {
    const clean = String(message || '').trim()
    if (!clean || busy) return
    setBusy(true)
    setError('')
    setText('')
    try {
      const result = await callApi('chat', { text: clean, choiceId })
      setView(result.view)
      if (!choiceId) {
        const suggestions = await callApi('memory-candidates', { text: clean })
        setMemoryCandidates(suggestions.candidates || [])
      }
    } catch (err) { setError(err.message || String(err)) }
    finally { setBusy(false) }
  }, [busy])

  const loadOlderHistory = async () => {
    try {
      const result = await callApi('history', { limit: 30, before: historyCursor ?? (view?.character?.chatLines?.length || 0) })
      setOlderLines(rows => [...result.lines, ...rows])
      setHistoryCursor(result.nextBefore)
      setHistoryTotal(result.total)
    } catch (err) { setError(err.message || String(err)) }
  }

  const loadSummaryCandidate = async () => {
    try {
      const result = await callApi('summary-candidate')
      setSummaryCandidate(result.candidate)
    } catch (err) { setError(err.message || String(err)) }
  }

  const confirmSummary = async () => {
    if (!summaryCandidate?.summary) return
    try {
      const result = await callApi('summary-confirm', {
        summary: summaryCandidate.summary,
        expectedStoryRevision: storyMemory?.revision || 0,
      })
      setStoryMemory(result.storyMemory)
      setSummaryCandidate(null)
    } catch (err) { setError(err.message || String(err)) }
  }

  const loadMemories = async () => {
    try {
      const result = await callApi('memory-list')
      setMemories(result.memories || [])
      setShowMemories(true)
    } catch (err) { setError(err.message || String(err)) }
  }

  if (!open) return React.createElement('div', { className: 'dva-root' },
    React.createElement('button', { className: 'dva-pet', title: '打开鲸鱼娘', onClick: () => { setOpen(true); void refresh() } },
      React.createElement('img', { src: view?.character?.imageUrl || API + '/assets/maid-left.webp', alt: 'DeepSeek 鲸鱼娘' }),
      React.createElement('span', null, '鲸鱼娘'),
    ),
  )

  const character = view?.character
  const lines = [...olderLines, ...(character?.chatLines || [])]
  return React.createElement('section', { className: 'dva-panel', role: 'dialog', 'aria-label': 'DeepSeek 鲸鱼娘', style: { backgroundImage: character?.backgroundUrl ? 'linear-gradient(180deg,rgba(4,15,29,.88),rgba(4,15,29,.94)),url(' + character.backgroundUrl + ')' : undefined, backgroundSize: 'cover', backgroundPosition: 'center' } },
    React.createElement('header', { className: 'dva-head' },
      React.createElement('div', null,
        React.createElement('div', { className: 'dva-title' }, character?.name || 'DeepSeek 鲸鱼娘'),
        React.createElement('div', { className: 'dva-sub' }, '深海女仆工坊 · 独立人格与长期记忆'),
      ),
      React.createElement('div', { className: 'dva-actions' },
        React.createElement('button', { onClick: () => void loadMemories() }, '记忆'),
        React.createElement('button', { onClick: () => void loadSummaryCandidate() }, '整理记忆'),
        React.createElement('button', { onClick: () => void loadMemories() }, '记忆'),
        React.createElement('button', { onClick: async () => { try { const result = await callApi('profile-get'); setProfileDraft(result.profile); setShowProfile(true) } catch (err) { setError(err.message || String(err)) } } }, '设定'),
        React.createElement('button', { onClick: async () => {
          try {
            const next = character?.backgroundUrl?.includes('bg-deepseek-seaside-study')
              ? 'palace-night'
              : 'bg-deepseek-seaside-study'
            const result = await callApi('background-set', { background: next })
            setView(result.view)
          } catch (err) { setError(err.message || String(err)) }
        } }, '切换场景'),
        React.createElement('button', { onClick: () => { void refresh() } }, '刷新'),
        React.createElement('button', { onClick: () => setOpen(false) }, '收起'),
      ),
    ),
    React.createElement('div', { className: 'dva-main' },
      React.createElement('aside', { className: 'dva-character' },
        React.createElement('img', { src: character?.imageUrl, alt: character?.name || '鲸鱼娘' }),
        React.createElement('div', { className: 'dva-stats' },
          'Lv.' + (character?.level || 1) + ' · 好感度 ' + (character?.affection || 0) + '/' + (character?.affectionCap || 30),
          React.createElement('br'),
          '信任 ' + Math.round((character?.relationship?.trust || 0) * 100) + '% · ' + (character?.relationship?.stage || 'acquaintance'),
        ),
      ),
      React.createElement('div', { className: 'dva-chat' },
        React.createElement('div', { className: 'dva-lines' },
          historyTotal > lines.length ? React.createElement('button', { onClick: () => void loadOlderHistory() }, '查看更早的对话') : null,
          ...lines.map((line, index) => React.createElement('div', { key: index, className: 'dva-line ' + (line.who === 'user' ? 'user' : 'heroine') }, line.text)),
          memoryCandidates.length ? React.createElement('div', { className: 'dva-memories' },
          React.createElement('strong', null, '可以记住这条信息吗？'),
          ...memoryCandidates.map((candidate, index) => React.createElement('div', { key: index },
            candidate.text,
            React.createElement('button', {
              disabled: busy,
              onClick: async () => {
                try {
                  await callApi('memory-add', { text: candidate.text, eventId: 'memory-confirm:' + Date.now() + ':' + index })
                  setMemoryCandidates(rows => rows.filter((_, rowIndex) => rowIndex !== index))
                } catch (err) { setError(err.message || String(err)) }
              },
            }, '记住'),
            React.createElement('button', { onClick: () => setMemoryCandidates(rows => rows.filter((_, rowIndex) => rowIndex !== index)) }, '忽略'),
          )),
        ) : null,
        summaryCandidate ? React.createElement('div', { className: 'dva-memories' },
          React.createElement('strong', null, '长期相处摘要候选'),
          React.createElement('p', null, summaryCandidate.summary || '目前没有足够内容生成摘要。'),
          React.createElement('small', null, summaryCandidate.warning),
          React.createElement('button', { disabled: !summaryCandidate.summary, onClick: () => void confirmSummary() }, '确认更新摘要'),
          React.createElement('button', { onClick: () => setSummaryCandidate(null) }, '暂不采用'),
        ) : null,
        showProfile ? React.createElement('div', { className: 'dva-memories' },
          React.createElement('strong', null, '鲸鱼娘角色设定'),
          ...['displayName','address','greeting','persona','tone','visual'].map(key => React.createElement('label', { key, style: { display: 'block', marginTop: '8px' } },
            key,
            React.createElement('textarea', {
              value: profileDraft[key] || '',
              rows: ['persona','tone','visual'].includes(key) ? 3 : 1,
              onChange: event => setProfileDraft(value => ({ ...value, [key]: event.target.value })),
              style: { display: 'block', width: '100%', boxSizing: 'border-box', background: '#06172a', color: '#fff', border: '1px solid #4d7796', borderRadius: '8px', padding: '7px' },
            }),
          )),
          React.createElement('button', { onClick: async () => { try { await callApi('profile-set', { profile: profileDraft }); setShowProfile(false); await refresh() } catch (err) { setError(err.message || String(err)) } } }, '保存设定'),
          React.createElement('button', { onClick: () => setShowProfile(false) }, '取消'),
        ) : null,
        showMemories ? React.createElement('div', { className: 'dva-memories' },
            React.createElement('strong', null, '鲸鱼娘的长期记忆'),
            ...memories.map(item => React.createElement('div', { key: item.id, className: 'dva-memory-row' },
              (item.pinned ? '★ ' : '') + item.text,
              React.createElement('button', { onClick: async () => { try { await callApi('memory-pin', { memoryId: item.id, pinned: !item.pinned }); await loadMemories() } catch (err) { setError(err.message || String(err)) } } }, item.pinned ? '取消置顶' : '置顶'),
              React.createElement('button', { onClick: async () => { try { await callApi('memory-delete', { memoryId: item.id }); await loadMemories() } catch (err) { setError(err.message || String(err)) } } }, '删除'),
            )),
            React.createElement('button', { onClick: () => setShowMemories(false) }, '关闭记忆'),
          ) : null,
        ),
        error ? React.createElement('div', { className: 'dva-error', role: 'alert' }, error) : null,
        React.createElement('div', { className: 'dva-choices' },
          ...(character?.choices || []).map(choice => React.createElement('button', {
            key: choice.id,
            disabled: busy,
            onClick: () => void send(choice.text, choice.id),
          }, choice.text)),
        ),
        React.createElement('form', { className: 'dva-input', onSubmit: event => { event.preventDefault(); void send(text) } },
          React.createElement('input', {
            value: text,
            maxLength: 500,
            placeholder: '和鲸鱼娘说说话……',
            onChange: event => setText(event.target.value),
          }),
          React.createElement('button', { className: 'dva-send', type: 'submit', disabled: busy || !text.trim() }, busy ? '思考中…' : '发送'),
        ),
      ),
    ),
  )
}

export const name = 'dsh-virtual-avatar-client'
export const inject = ['slots']

export function apply(ctx) {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-virtual-avatar'
  style.textContent = CSS
  document.head.appendChild(style)
  const slots = ctx.slots || ctx.get?.('slots')
  const mount = () => React.createElement(Companion)
  if (slots && typeof slots.inject === 'function') {
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'dsh-virtual-avatar', order: 900 },
      () => mount(),
    ))
  } else {
    const rootNode = document.createElement('div')
    document.body.appendChild(rootNode)
    const root = createRoot(rootNode)
    root.render(mount())
    ctx.effect?.(() => () => { root.unmount(); rootNode.remove(); style.remove() }, 'dsh-virtual-avatar client overlay')
    return
  }
  ctx.effect?.(() => () => style.remove(), 'dsh-virtual-avatar styles')
}
