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
.dva-line.user{align-self:flex-end;background:#23577a}.dva-line.heroine{align-self:flex-start}.dva-day-divider{align-self:center;margin:8px 0;padding:3px 10px;border-radius:999px;background:#ffffff18;color:#a9c9df;font-size:11px}.dva-empty{align-self:center;margin:auto;color:#a9c9df;font-size:13px}
.dva-actions button,.dva-send{border:1px solid #77b8df;border-radius:999px;background:#174b70;color:#f2f9ff;padding:8px 13px;cursor:pointer}
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
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memoryLevel, setMemoryLevel] = useState('all')
  const [memoryPinned, setMemoryPinned] = useState('all')
  const [backups, setBackups] = useState([])
  const [showBackups, setShowBackups] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [diagnostics, setDiagnostics] = useState(null)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const [modelTestBusy, setModelTestBusy] = useState(false)
  const [modelTestResult, setModelTestResult] = useState(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [editingMemoryId, setEditingMemoryId] = useState(null)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [olderLines, setOlderLines] = useState([])
  const [historyCursor, setHistoryCursor] = useState(null)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearchLoading, setHistorySearchLoading] = useState(false)
  const [relationshipLoading, setRelationshipLoading] = useState(false)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyMatches, setHistoryMatches] = useState([])
  const [showHistorySearch, setShowHistorySearch] = useState(false)
  const [relationshipEvents, setRelationshipEvents] = useState([])
  const [showRelationshipHistory, setShowRelationshipHistory] = useState(false)
  const [memoryCandidates, setMemoryCandidates] = useState([])
  const [showMemories, setShowMemories] = useState(false)
  const [storyMemory, setStoryMemory] = useState(null)
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
    if (historyLoading || historyCursor === null && olderLines.length > 0) return
    setHistoryLoading(true)
    try {
      const result = await callApi('history', { limit: 30, before: historyCursor ?? (view?.character?.chatLines?.length || 0) })
      setOlderLines(rows => [...result.lines, ...rows])
      setHistoryCursor(result.nextBefore)
      setHistoryTotal(result.total)
    } catch (err) { setError(err.message || String(err)) }
    finally { setHistoryLoading(false) }
  }

  const searchHistory = async () => {
    setHistorySearchLoading(true)
    try {
      const result = await callApi('history-search', { query: historyQuery })
      setHistoryMatches(result.matches || [])
      setShowHistorySearch(true)
    } catch (err) { setError(err.message || String(err)) }
    finally { setHistorySearchLoading(false) }
  }

  const loadRelationshipHistory = async () => {
    setRelationshipLoading(true)
    try {
      const result = await callApi('relationship-history', { limit: 50 })
      setRelationshipEvents(result.events || [])
      setShowRelationshipHistory(true)
    } catch (err) { setError(err.message || String(err)) }
    finally { setRelationshipLoading(false) }
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
        expectedStoryRevision: summaryCandidate.expectedRevision || 0,
      })
      setStoryMemory(result.storyMemory)
      setSummaryCandidate(null)
    } catch (err) { setError(err.message || String(err)) }
  }

  const exportMemories = async () => {
    try {
      const result = await callApi('memory-export')
      const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'deepseek-whale-memories.json'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err.message || String(err)) }
  }

  const testModelConnection = async () => {
    setModelTestBusy(true)
    try {
      const result = await callApi('model-test')
      setModelTestResult(result.test)
      await loadDiagnostics()
    } catch (err) { setError(err.message || String(err)) }
    finally { setModelTestBusy(false) }
  }

  const exportDiagnostics = () => {
    if (!diagnostics) return
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'dsh-virtual-avatar-diagnostics.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const loadDiagnostics = async () => {
    setShowDiagnostics(true)
    setDiagnosticsBusy(true)
    try {
      const result = await callApi('diagnostics')
      setDiagnostics(result.diagnostics)
    } catch (err) { setError(err.message || String(err)) }
    finally { setDiagnosticsBusy(false) }
  }

  const loadBackups = async () => {
    setShowBackups(true)
    try {
      const result = await callApi('backup-list')
      setBackups(result.backups || [])
    } catch (err) { setError(err.message || String(err)) }
  }

  const createBackup = async () => {
    setBackupBusy(true)
    try {
      const result = await callApi('backup-create')
      setError('备份已创建：' + result.backup.id)
      await loadBackups()
    } catch (err) { setError(err.message || String(err)) }
    finally { setBackupBusy(false) }
  }

  const restoreBackup = async backupId => {
    if (!window.confirm('恢复此备份将覆盖当前角色、记忆和媒体数据。建议先创建当前备份。确定继续吗？')) return
    setBackupBusy(true)
    try {
      const verified = await callApi('backup-verify', { backupId })
      if (!verified.verification.valid) throw new Error('备份完整性校验失败')
      await callApi('backup-restore', { backupId, confirmed: true })
      setError('备份恢复完成，已重新加载角色状态。')
      await refresh()
      await loadBackups()
    } catch (err) { setError(err.message || String(err)) }
    finally { setBackupBusy(false) }
  }

  const loadMemories = async (filters = {}) => {
    setMemoryLoading(true)
    try {
      const result = await callApi('memory-list', {
        query: filters.query ?? memoryQuery,
        level: filters.level ?? memoryLevel,
        pinned: filters.pinned ?? memoryPinned,
      })
      setMemories(result.memories || [])
      setShowMemories(true)
    } catch (err) { setError(err.message || String(err)) }
    finally { setMemoryLoading(false) }
  }

  if (!open) return React.createElement('div', { className: 'dva-root' },
    React.createElement('button', { className: 'dva-pet', title: '打开鲸鱼娘', onClick: () => { setOpen(true); void refresh() } },
      React.createElement('img', { src: view?.character?.imageUrl || API + '/assets/maid-left.webp', alt: 'DeepSeek 鲸鱼娘' }),
      React.createElement('span', null, '鲸鱼娘'),
    ),
  )

  const character = view?.character
  const lines = [...olderLines, ...(character?.chatLines || [])]
  const chatGroups = lines.reduce((groups, line, index) => {
    const timestamp = Number(line.at || 0)
    const day = timestamp > 0 ? new Date(timestamp).toLocaleDateString() : '时间未知'
    const last = groups[groups.length - 1]
    if (!last || last.day !== day) groups.push({ day, rows: [] })
    groups[groups.length - 1].rows.push({ ...line, key: index })
    return groups
  }, [])
  return React.createElement('section', { className: 'dva-panel', role: 'dialog', 'aria-label': 'DeepSeek 鲸鱼娘', style: { backgroundImage: character?.backgroundUrl ? 'linear-gradient(180deg,rgba(4,15,29,.88),rgba(4,15,29,.94)),url(' + character.backgroundUrl + ')' : undefined, backgroundSize: 'cover', backgroundPosition: 'center' } },
    React.createElement('header', { className: 'dva-head' },
      React.createElement('div', null,
        React.createElement('div', { className: 'dva-title' }, character?.name || 'DeepSeek 鲸鱼娘'),
        React.createElement('div', { className: 'dva-sub' }, '深海女仆工坊 · 独立人格与长期记忆'),
      ),
      React.createElement('div', { className: 'dva-actions' },
        React.createElement('button', { disabled: memoryLoading, onClick: () => void loadMemories() }, memoryLoading ? '读取中…' : '记忆管理'),
        React.createElement('button', { disabled: relationshipLoading, onClick: () => void loadRelationshipHistory() }, relationshipLoading ? '读取中…' : '关系记录'),
        React.createElement('button', { onClick: () => setShowHistorySearch(value => !value) }, '搜索对话'),
        React.createElement('button', { onClick: async () => { await loadBackups() } }, '备份恢复'),
        React.createElement('button', { disabled: diagnosticsBusy, onClick: () => void loadDiagnostics() }, diagnosticsBusy ? '检查中…' : '运行诊断'),
        React.createElement('button', { onClick: () => void loadSummaryCandidate() }, '整理记忆'),
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
          React.createElement('br'),
          '依恋 ' + Math.round((character?.relationship?.attachment || 0) * 100) + '%',
          React.createElement('br'),
          '关系阶段 ' + ({ acquaintance: '初识', familiar: '熟悉', close: '亲近', intimate: '亲密' }[character?.relationship?.stage] || '初识'),
          React.createElement('br'),
          React.createElement('small', null, '好感度推动等级成长；信任与依恋分别反映关系质量。'),

        ),
      ),
      React.createElement('div', { className: 'dva-chat' },
        showHistorySearch ? React.createElement('div', { className: 'dva-memory-panel' },
          React.createElement('input', { value: historyQuery, placeholder: '搜索过去的对话（至少两个字）', onChange: event => setHistoryQuery(event.target.value) }),
          React.createElement('button', { disabled: historySearchLoading, onClick: () => void searchHistory() }, historySearchLoading ? '搜索中…' : '搜索'),
          ...historyMatches.map(item => React.createElement('div', { key: item.index, className: 'dva-memory-row' }, '[' + (item.who || item.role || '') + '] ' + item.text)),
          historyMatches.length === 0 ? React.createElement('small', null, '暂无匹配记录，请尝试其他关键词。') : null,
        ) : null,
        showRelationshipHistory ? React.createElement('div', { className: 'dva-memory-panel' },
          React.createElement('strong', null, '关系变化记录'),
          ...relationshipEvents.map(item => React.createElement('div', { key: item.id, className: 'dva-memory-row' },
            React.createElement('strong', null, item.label || item.type),
            React.createElement('div', null, new Date(item.createdAt).toLocaleString()),
            item.details?.affectionDelta ? React.createElement('div', null, '好感度变化：' + (item.details.affectionDelta > 0 ? '+' : '') + item.details.affectionDelta) : null,
            item.details?.levelChanged ? React.createElement('div', null, '等级提升：Lv.' + item.details.levelBefore + ' → Lv.' + item.details.levelAfter) : null,
            item.details?.stageChanged ? React.createElement('div', null, '关系阶段：' + item.details.stageBefore + ' → ' + item.details.stageAfter) : null,
            React.createElement('small', null, '信任 ' + Math.round((item.details?.trustBefore || 0) * 100) + '% → ' + Math.round((item.details?.trustAfter || 0) * 100) + '% · 依恋 ' + Math.round((item.details?.attachmentBefore || 0) * 100) + '% → ' + Math.round((item.details?.attachmentAfter || 0) * 100) + '%'),
          )),
          React.createElement('button', { onClick: () => setShowRelationshipHistory(false) }, '关闭'),
        ) : null,
        React.createElement('div', { className: 'dva-lines' },
          historyTotal > lines.length ? React.createElement('button', { disabled: historyLoading, onClick: () => void loadOlderHistory() }, historyLoading ? '加载中…' : '查看更早的对话') : null,
          chatGroups.length === 0 ? React.createElement('div', { className: 'dva-empty' }, '还没有聊天记录，和鲸鱼娘打个招呼吧。') : null,
          ...chatGroups.flatMap(group => [
            React.createElement('div', { key: 'day-' + group.day, className: 'dva-day-divider' }, group.day),
            ...group.rows.map(line => React.createElement('div', { key: line.key, className: 'dva-line ' + (line.who === 'user' ? 'user' : 'heroine') }, line.text)),
          ]),
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
          React.createElement('h4', null, '称呼与互动'),
          ...[
            { key: 'displayName', label: '角色名称', hint: '界面中显示的角色名称。', max: 32, rows: 1 },
            { key: 'address', label: '对你的称呼', hint: '例如：主人、你、昵称。', max: 24, rows: 1 },
            { key: 'greeting', label: '初次问候', hint: '打开陪伴界面时使用的问候语。', max: 160, rows: 2 },
          ].map(field => React.createElement('label', { key: field.key, style: { display: 'block', marginTop: '8px' } },
            React.createElement('strong', null, field.label),
            React.createElement('small', { style: { display: 'block', opacity: .72 } }, field.hint),
            React.createElement('textarea', {
              value: profileDraft[field.key] || '',
              maxLength: field.max,
              rows: field.rows,
              onChange: event => setProfileDraft(value => ({ ...value, [field.key]: event.target.value })),
              style: { display: 'block', width: '100%', boxSizing: 'border-box', background: '#06172a', color: '#fff', border: '1px solid #4d7796', borderRadius: '8px', padding: '7px' },
            }),
            React.createElement('small', null, Array.from(profileDraft[field.key] || '').length + '/' + field.max),
          )),
          React.createElement('h4', null, '人格与表达'),
          ...[
            { key: 'persona', label: '性格设定', hint: '描述稳定性格、价值倾向和行为边界。', max: 1200, rows: 4 },
            { key: 'tone', label: '说话风格', hint: '描述语气、表达习惯，不建议堆叠固定台词。', max: 600, rows: 3 },
            { key: 'visual', label: '外观描述', hint: '用于角色设定说明，不会自动生成或替换立绘。', max: 800, rows: 3 },
          ].map(field => React.createElement('label', { key: field.key, style: { display: 'block', marginTop: '8px' } },
            React.createElement('strong', null, field.label),
            React.createElement('small', { style: { display: 'block', opacity: .72 } }, field.hint),
            React.createElement('textarea', {
              value: profileDraft[field.key] || '',
              maxLength: field.max,
              rows: field.rows,
              onChange: event => setProfileDraft(value => ({ ...value, [field.key]: event.target.value })),
              style: { display: 'block', width: '100%', boxSizing: 'border-box', background: '#06172a', color: '#fff', border: '1px solid #4d7796', borderRadius: '8px', padding: '7px' },
            }),
            React.createElement('small', null, Array.from(profileDraft[field.key] || '').length + '/' + field.max),
          )),
          React.createElement('button', { onClick: async () => {
            try {
              const result = await callApi('profile-set', { profile: profileDraft })
              setProfileDraft(result.profile)
              setShowProfile(false)
              await refresh()
            } catch (err) { setError(err.message || String(err)) }
          } }, '保存设定'),
          React.createElement('button', { onClick: async () => {
            if (!window.confirm('恢复默认角色设定？这不会删除记忆或关系数据。')) return
            try {
              const result = await callApi('profile-set', { profile: {} })
              setProfileDraft(result.profile)
            } catch (err) { setError(err.message || String(err)) }
          } }, '恢复默认设定'),
          React.createElement('button', { onClick: () => setShowProfile(false) }, '取消'),
        ) : null,
        showDiagnostics ? React.createElement('div', { className: 'dva-memories' },
          React.createElement('strong', null, '运行状态与诊断'),
          React.createElement('button', { disabled: diagnosticsBusy, onClick: () => void loadDiagnostics() }, diagnosticsBusy ? '检查中…' : '重新检查'),
          React.createElement('button', { disabled: modelTestBusy, onClick: () => void testModelConnection() }, modelTestBusy ? '测试中…' : '测试模型连接'),
          React.createElement('button', { disabled: !diagnostics, onClick: exportDiagnostics }, '导出诊断报告'),
          modelTestResult ? React.createElement('small', null, '最近模型测试：' + (modelTestResult.status === 'success' ? '成功' : '失败') + ' · ' + modelTestResult.at) : null,

          diagnostics ? React.createElement(React.Fragment, null,
            React.createElement('h4', null, '模型配置'),
            React.createElement('div', null, '状态：' + (diagnostics.model.status === 'configured' ? '已配置' : '未配置')),
            React.createElement('div', null, 'Provider：' + (diagnostics.model.selected?.provider || '未选择')),
            React.createElement('div', null, 'Model：' + (diagnostics.model.selected?.model || '未选择')),
            diagnostics.model.selectionError ? React.createElement('small', { className: 'dva-error' }, diagnostics.model.selectionError.message) : null,
            React.createElement('small', null, 'Provider 列表：' + (diagnostics.model.providers.map(item => item.name).join('、') || '未发现')),
            React.createElement('h4', null, '人格运行时'),
            React.createElement('div', null, 'PPL Runtime：' + diagnostics.persona.runtime),
            React.createElement('div', null, 'Persona IR：' + diagnostics.persona.ir.status + ' · ' + (diagnostics.persona.ir.version || '未知版本')),
            React.createElement('div', null, '规则数量：' + diagnostics.persona.rules),
            React.createElement('div', null, 'PPL 源文件：' + diagnostics.persona.source.status),
            React.createElement('h4', null, '数据存储'),
            React.createElement('div', null, 'SQLite：' + diagnostics.storage.database.status + ' · ' + (diagnostics.storage.database.fileBytes ?? 0) + ' bytes'),
            React.createElement('div', null, '长期记忆：' + diagnostics.storage.memoryCount + ' 条（置顶 ' + diagnostics.storage.pinnedMemoryCount + '）'),
            React.createElement('div', null, '媒体资产：' + diagnostics.storage.mediaAssetCount + ' 个 · ' + diagnostics.storage.mediaBytes + ' bytes'),
            React.createElement('div', null, '备份目录：' + diagnostics.storage.backupDirectory.files + ' 个文件'),
            React.createElement('h4', null, '陪伴状态'),
            React.createElement('div', null, 'Lv.' + diagnostics.companion.level + ' · 好感度 ' + diagnostics.companion.affection),
            React.createElement('div', null, '信任 ' + Math.round((diagnostics.companion.trust || 0) * 100) + '% · 依恋 ' + Math.round((diagnostics.companion.attachment || 0) * 100) + '%'),
            React.createElement('div', null, '最近成功对话：' + (diagnostics.companion.lastSuccessfulTurnAt || '本次运行尚无')),
            React.createElement('h4', null, '最近错误'),
            diagnostics.recentErrors.length ? diagnostics.recentErrors.map(item => React.createElement('div', { key: item.at + item.action, className: 'dva-memory-row' }, item.at + ' · ' + item.action + ' · ' + item.code + ' · ' + item.message)) : React.createElement('small', null, '当前运行期间没有记录到错误。'),
            React.createElement('small', null, '检查时间：' + diagnostics.checkedAt),
          ) : React.createElement('small', null, '正在读取插件状态…'),
          React.createElement('button', { onClick: () => setShowDiagnostics(false) }, '关闭诊断'),
        ) : null,
        showBackups ? React.createElement('div', { className: 'dva-memories' },
          React.createElement('strong', null, '本地备份与恢复'),
          React.createElement('button', { disabled: backupBusy, onClick: () => void createBackup() }, backupBusy ? '处理中…' : '立即创建备份'),
          ...backups.map(item => React.createElement('div', { key: item.id, className: 'dva-memory-row' },
            item.id + ' · ' + (item.createdAt || '清单异常'),
            React.createElement('button', { disabled: backupBusy || item.valid === false, onClick: () => void restoreBackup(item.id) }, '校验并恢复'),
          )),
          React.createElement('button', { onClick: () => setShowBackups(false) }, '关闭备份'),
        ) : null,
        showMemories ? React.createElement('div', { className: 'dva-memories' },
            React.createElement('strong', null, '鲸鱼娘的长期记忆'),
            React.createElement('button', { onClick: () => void exportMemories() }, '导出记忆'),
            React.createElement('input', { value: memoryQuery, placeholder: '搜索记忆内容', onChange: event => setMemoryQuery(event.target.value) }),
            React.createElement('select', { value: memoryLevel, onChange: event => setMemoryLevel(event.target.value) },
              React.createElement('option', { value: 'all' }, '全部层级'),
              React.createElement('option', { value: 'core' }, '核心记忆'),
              React.createElement('option', { value: 'mid' }, '重要记忆'),
              React.createElement('option', { value: 'edge' }, '普通记忆'),
            ),
            React.createElement('select', { value: memoryPinned, onChange: event => setMemoryPinned(event.target.value) },
              React.createElement('option', { value: 'all' }, '全部状态'),
              React.createElement('option', { value: 'pinned' }, '仅置顶'),
              React.createElement('option', { value: 'normal' }, '未置顶'),
            ),
            React.createElement('button', { onClick: () => void loadMemories() }, '筛选'),
            React.createElement('small', null, '共显示 ' + memories.length + ' 条记忆'),
            memories.length === 0 ? React.createElement('p', null, '没有符合条件的记忆。可以调整筛选条件，或在对话中确认保存新的记忆。') : null,

            ...memories.map(item => React.createElement('div', { key: item.id, className: 'dva-memory-row' },
              editingMemoryId === item.id
                ? React.createElement('div', null,
                    React.createElement('textarea', { value: memoryDraft, maxLength: 400, onChange: event => setMemoryDraft(event.target.value), rows: 2, style: { width: '100%', boxSizing: 'border-box' } }),
                    React.createElement('button', { onClick: async () => { try { await callApi('memory-edit', { memoryId: item.id, text: memoryDraft }); setEditingMemoryId(null); await loadMemories() } catch (err) { setError(err.message || String(err)) } } }, '保存'),
                    React.createElement('button', { onClick: () => setEditingMemoryId(null) }, '取消'),
                  )
                : (item.pinned ? '★ ' : '') + item.text,
              React.createElement('small', null, (item.level === 'core' ? '核心' : item.level === 'mid' ? '重要' : '普通') + ' · 来源：' + (item.source || '未知') + ' · 最近使用：' + (item.lastSeenAt || '未知')),
              editingMemoryId !== item.id ? React.createElement('button', { onClick: () => { setEditingMemoryId(item.id); setMemoryDraft(item.text) } }, '编辑') : null,
              React.createElement('button', { onClick: async () => { try { await callApi('memory-pin', { memoryId: item.id, pinned: !item.pinned }); await loadMemories() } catch (err) { setError(err.message || String(err)) } } }, item.pinned ? '取消置顶' : '置顶'),
              React.createElement('button', { onClick: async () => { if (!window.confirm('确定删除这条长期记忆吗？删除后将不再用于后续对话。')) return; try { await callApi('memory-delete', { memoryId: item.id }); await loadMemories() } catch (err) { setError(err.message || String(err)) } } }, '删除'),
            )),
            React.createElement('button', { onClick: () => setShowMemories(false) }, '关闭记忆'),
          ) : null,
        ),
        error ? React.createElement('div', { className: 'dva-error', role: 'alert' }, error) : null,
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
