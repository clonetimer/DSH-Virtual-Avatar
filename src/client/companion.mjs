import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const API = '/api/dsh-virtual-avatar'
const CSS = `
.dva-root{position:fixed;right:18px;bottom:104px;z-index:8999;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#eaf5ff}
.dva-pet{width:112px;height:132px;border:0;border-radius:18px;background:transparent;box-shadow:none;cursor:pointer;padding:0;filter:drop-shadow(0 8px 14px #00172b88);transition:transform .18s ease}.dva-pet:hover{transform:translateY(-5px) scale(1.035)}.dva-pet img{width:100%;height:100%;object-fit:contain};animation:dva-pet-idle 5.2s ease-in-out infinite;transform-origin:50% 88%.dva-pet span{display:block;margin-top:-4px;padding:4px 8px;border:1px solid #8bcdf288;border-radius:999px;background:#092642dd;color:#eaf5ff;font-size:11px;text-align:center}
.dva-panel{position:fixed;inset:5vh 5vw;z-index:9000;display:flex;flex-direction:column;overflow:hidden;border:1px solid #6ea9cc;border-radius:20px;background:linear-gradient(160deg,#0b2340,#07172b 65%,#0b3152);box-shadow:0 24px 80px #000b;color:#eaf5ff}
.dva-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 20px;border-bottom:1px solid #ffffff22}
.dva-head-tools{position:relative;display:flex;align-items:center;gap:8px;flex-shrink:0}
.dva-more-trigger,.dva-collapse{border:1px solid #77b8df;border-radius:999px;background:#174b70;color:#f2f9ff;padding:8px 13px;cursor:pointer}
.dva-more-menu{position:absolute;top:calc(100% + 10px);right:0;z-index:30;width:min(360px,82vw);max-height:min(70vh,620px);overflow:auto;padding:12px;border:1px solid #6ea9cc;border-radius:16px;background:#09223af5;box-shadow:0 18px 44px #0009;backdrop-filter:blur(14px)}
.dva-menu-group{padding:7px 4px;border-bottom:1px solid #ffffff18}
.dva-menu-group:last-child{border-bottom:0}
.dva-menu-group>strong{display:block;margin:0 0 7px 3px;color:#a9c9df;font-size:11px;font-weight:650}
.dva-menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.dva-menu-item{min-height:36px;border:1px solid #ffffff20;border-radius:9px;background:#123a58;color:#eaf5ff;padding:8px 10px;text-align:left;cursor:pointer}
.dva-menu-item:hover{background:#1b5277}
.dva-menu-item:disabled{opacity:.5;cursor:wait}
.dva-notice{padding:8px 11px;border:1px solid #74b6d344;border-radius:10px;background:#123b55;color:#c8eaff;font-size:12px}
.dva-utility-overlay{position:absolute;inset:0;z-index:20;display:flex;align-items:stretch;padding:14px;background:#06172aee;border:1px solid #6ea9cc;border-radius:14px;box-shadow:0 14px 40px #0008;backdrop-filter:blur(10px)}
.dva-utility-overlay>.dva-memories,.dva-utility-overlay>.dva-memory-panel{width:100%;height:100%;max-height:100%;box-sizing:border-box;}
.dva-memory-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:2px 0 12px;margin-bottom:12px;border-bottom:1px solid #ffffff22;background:#0b2238}
.dva-memory-head>div{display:flex;flex-direction:column;gap:5px;min-width:0}
.dva-memory-head small{color:#9abbd2;line-height:1.5}
.dva-panel-back{flex:0 0 auto;border:1px solid #77b8df;border-radius:999px;background:#174b70;color:#f2f9ff;padding:8px 13px;cursor:pointer}
.dva-memory-toolbar{display:grid;grid-template-columns:minmax(160px,1fr) minmax(110px,auto) minmax(110px,auto) auto auto;gap:8px;align-items:center;margin:10px 0}
.dva-memory-toolbar input,.dva-memory-toolbar select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #4d7796;border-radius:9px;background:#06172a;color:#f2f9ff;padding:9px 10px}
.dva-memory-toolbar button{min-height:36px;border:1px solid #77b8df;border-radius:9px;background:#174b70;color:#f2f9ff;padding:8px 12px;cursor:pointer}
.dva-memory-toolbar button:disabled{opacity:.5;cursor:wait}
.dva-memory-count{display:block;margin:8px 0;color:#9abbd2}
.dva-memory-empty{padding:14px;border:1px dashed #ffffff2e;border-radius:10px;color:#a9c9df;background:#ffffff08}
.dva-motion-panel{display:flex;flex-direction:column;gap:12px}
.dva-motion-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.dva-motion-help{color:#a9c9df;line-height:1.6}
.dva-motion-picker{display:block;padding:11px;border:1px dashed #85bcdd88;border-radius:12px;background:#0d3454}
.dva-motion-picker input{display:block;width:100%;margin-top:8px;color:#d3e9f8;font-size:12px}
.dva-motion-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dva-motion-row select,.dva-motion-row button{border:1px solid #77b8df;border-radius:9px;background:#174b70;color:#f2f9ff;padding:7px 10px;min-height:34px}
.dva-motion-row button{cursor:pointer}
.dva-motion-row button:disabled{opacity:.5;cursor:wait}
.dva-motion-stage{display:flex;align-items:center;justify-content:center;min-height:160px;height:min(43vh,400px);border:1px solid #ffffff22;border-radius:14px;background:radial-gradient(ellipse at center,#16466b,#091b30 70%);overflow:hidden}
.dva-motion-stage img{display:block;max-width:100%;max-height:100%;object-fit:contain}
.dva-motion-note{font-size:11px;color:#9abbd2;line-height:1.5}
.dva-motion-error{font-size:12px;color:#ffd0c9;background:#52243888;border:1px solid #ffb3a944;border-radius:9px;padding:9px}

@media(max-width:900px){.dva-memory-toolbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.dva-memory-toolbar input{grid-column:1/-1}.dva-memory-head{align-items:center}.dva-panel-back{padding:7px 10px}}
.dva-title{font-size:18px;font-weight:700}.dva-sub{font-size:12px;color:#a9c9df;margin-top:4px}
.dva-main{display:grid;grid-template-columns:minmax(180px,28%) minmax(0,1fr);grid-template-rows:minmax(0,1fr);min-height:0;flex:1;overflow:hidden}
.dva-character{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px;min-height:0;overflow-y:auto;padding:14px 20px;background:radial-gradient(ellipse at center,#16466b,#091b30 70%)}
.dva-avatar-stage{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:min(100%,300px);isolation:isolate}
.dva-avatar-stage img{position:relative;z-index:1;display:block;width:min(100%,260px);height:auto;max-height:min(42vh,420px);object-fit:contain;transform-origin:50% 86%;filter:drop-shadow(0 12px 20px #0008);animation:dva-avatar-idle 4.8s ease-in-out infinite;will-change:transform}
.dva-avatar-stage::after{content:"";position:absolute;z-index:0;left:25%;right:25%;bottom:2%;height:10px;border-radius:50%;background:#0006;filter:blur(7px);animation:dva-avatar-shadow 4.8s ease-in-out infinite}
.dva-avatar-stage.is-thinking img{animation:dva-avatar-thinking 1.7s ease-in-out infinite}
.dva-avatar-stage.is-responding img{animation:dva-avatar-response .72s ease-in-out 2}
.dva-avatar-stage[role=button]{cursor:pointer;outline:none}
.dva-avatar-stage[role=button]:focus-visible{outline:2px solid #a9dfff;outline-offset:5px;border-radius:18px}
.dva-avatar-stage.is-patting img{animation:dva-avatar-pat .56s ease-in-out 2}
.dva-avatar-stage.is-swaying img{animation:dva-avatar-sway 1.35s ease-in-out}
.dva-avatar-stage.is-idle.is-state-shy img{animation:dva-avatar-state-shy 4.2s ease-in-out infinite}
.dva-avatar-stage.is-idle.is-state-tense img{animation:dva-avatar-state-tense 2.6s ease-in-out infinite}
.dva-avatar-stage.is-idle.is-state-nervous img{animation:dva-avatar-state-nervous 2.8s ease-in-out infinite}
.dva-avatar-stage.is-idle.is-state-subdued img{animation:dva-avatar-state-subdued 6s ease-in-out infinite}
.dva-avatar-stage.is-idle.is-state-resting img{animation:dva-avatar-state-resting 6.8s ease-in-out infinite}
.dva-avatar-stage.is-idle[data-tempo="slow"] img{animation-duration:6.8s}
.dva-avatar-bubble{position:absolute;z-index:4;left:50%;top:3%;transform:translate(-50%,-100%);max-width:210px;padding:7px 11px;border:1px solid #9bd9ff99;border-radius:13px;background:#f1f9ff;color:#17405d;font-size:12px;line-height:1.4;white-space:nowrap;box-shadow:0 5px 18px #0005;animation:dva-bubble-pop .18s ease-out both}
.dva-avatar-bubble::after{content:"";position:absolute;left:50%;bottom:-6px;width:10px;height:10px;transform:translateX(-50%) rotate(45deg);background:#f1f9ff;border-right:1px solid #9bd9ff99;border-bottom:1px solid #9bd9ff99}
.dva-avatar-hint{display:block;margin-top:-5px;color:#9abbd2;font-size:10px;text-align:center}
.dva-avatar-status{position:absolute;z-index:2;left:50%;bottom:-3px;transform:translateX(-50%);padding:4px 10px;border:1px solid #8bcdf288;border-radius:999px;background:#092642ee;color:#eaf5ff;font-size:11px;white-space:nowrap}
.dva-avatar-stage.is-thinking::after{animation-duration:1.7s}
.dva-stats{font-size:13px;color:#b9d8ec;line-height:1.9;text-align:center}
.dva-stats{font-size:13px;color:#b9d8ec;line-height:1.9;text-align:center}
.dva-state-strip{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin-top:8px;max-width:260px}
.dva-state-label{width:100%;font-size:10px;color:#91b4cc;text-align:center}
.dva-state-chip{border:1px solid #ffffff24;border-radius:999px;background:#0b2943bb;color:#c6e2f4;padding:3px 7px;font-size:10px;font-variant-numeric:tabular-nums}
.dva-state-chip b{color:#f1f9ff;font-weight:650}
.dva-scene-toggle{margin-top:16px;padding:12px;border:1px solid #ffffff22;border-radius:14px;background:#0b2238;width:100%;max-width:250px}
.dva-scene-title{font-size:12px;color:#a9c9df;margin-bottom:8px}
.dva-scene-options{display:flex;gap:8px}
.dva-scene-option{flex:1;border:1px solid #6ea9cc;border-radius:999px;background:#123a58;color:#dff2ff;padding:7px 10px;cursor:pointer}
.dva-scene-option.active{background:#d7efff;color:#123a58;border-color:#d7efff}
.dva-scene-option:disabled{opacity:.5;cursor:wait}
.dva-scene-hint{display:block;margin-top:7px;color:#9abbd2;font-size:11px;line-height:1.5}
.dva-chat{position:relative;display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;min-width:0;min-height:0;overflow:hidden;padding:18px;gap:12px}
.dva-lines{min-height:0;overflow:auto;overscroll-behavior:contain;flex:1 1 0;display:flex;flex-direction:column;gap:10px;padding-right:6px}
.dva-line{max-width:88%;padding:10px 13px;border-radius:14px;background:#173b59;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.dva-line.user{align-self:flex-end;background:#23577a}.dva-line.heroine{align-self:flex-start}.dva-day-divider{align-self:center;margin:8px 0;padding:3px 10px;border-radius:999px;background:#ffffff18;color:#a9c9df;font-size:11px}.dva-empty{align-self:center;margin:auto;color:#a9c9df;font-size:13px}
.dva-actions button,.dva-send{border:1px solid #77b8df;border-radius:999px;background:#174b70;color:#f2f9ff;padding:8px 13px;cursor:pointer}
.dva-starters{display:flex;align-items:center;flex-wrap:wrap;gap:7px;flex:0 0 auto}
.dva-starters-label{width:100%;color:#9abbd2;font-size:11px}
.dva-starter{border:1px solid #6ea9cc88;border-radius:999px;background:#123a58;color:#dff2ff;padding:7px 11px;font-size:12px;cursor:pointer}
.dva-starter:hover{background:#1b5277}
.dva-input{display:flex;flex:0 0 auto;position:relative;z-index:3;gap:8px;padding-top:10px;border-top:1px solid #ffffff20;background:linear-gradient(180deg,rgba(7,23,43,.72),rgba(7,23,43,.98))}
.dva-input input{flex:1;min-width:0;height:44px;box-sizing:border-box;border:1px solid #4d7796;border-radius:12px;background:#06172a;color:#fff;padding:11px;font-size:14px}
.dva-actions{display:flex;gap:8px;align-items:center}.dva-actions button:disabled,.dva-send:disabled{opacity:.45;cursor:wait}
.dva-memories,.dva-memory-panel{max-height:44vh;overflow:auto;font-size:12px;color:#c2dced;background:#0b2238;border:1px solid #ffffff22;border-radius:12px;padding:12px}.dva-memory-row{padding:6px 0;border-bottom:1px solid #ffffff18}.dva-memory-row button{margin:4px;border:1px solid #77b8df;border-radius:999px;background:#174b70;color:#f2f9ff;padding:4px 8px}.dva-error{position:relative;z-index:25;color:#ffb5a9;font-size:12px}
.dva-notice{position:relative;z-index:25}
@keyframes dva-avatar-idle{0%,100%{transform:translateY(0) rotate(0deg) scale(1)}50%{transform:translateY(-7px) rotate(.45deg) scale(1.008)}}
@keyframes dva-avatar-thinking{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-9px) rotate(-.8deg)}}
@keyframes dva-avatar-response{0%,100%{transform:translateY(0) rotate(0deg) scale(1)}38%{transform:translateY(-13px) rotate(1deg) scale(1.018)}72%{transform:translateY(-3px) rotate(-.4deg) scale(1.005)}}
@keyframes dva-avatar-pat{0%,100%{transform:translateY(0) rotate(0deg) scale(1)}30%{transform:translateY(-12px) rotate(-2deg) scale(1.025)}62%{transform:translateY(-3px) rotate(1deg) scale(1.012)}}
@keyframes dva-avatar-sway{0%,100%{transform:translateY(0) rotate(0deg)}32%{transform:translate(5px,-4px) rotate(1.1deg)}68%{transform:translate(-3px,-2px) rotate(-.7deg)}}
@keyframes dva-avatar-state-shy{0%,100%{transform:translateY(0) rotate(0deg) scale(1)}50%{transform:translateY(-5px) rotate(-.7deg) scale(1.01)}}
@keyframes dva-avatar-state-tense{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-1px) rotate(-.7deg)}50%{transform:translateY(0) rotate(.7deg)}75%{transform:translateY(-1px) rotate(-.4deg)}}
@keyframes dva-avatar-state-nervous{0%,100%{transform:translateY(0) rotate(0deg)}35%{transform:translate(1px,-2px) rotate(.35deg)}70%{transform:translate(-1px,0) rotate(-.35deg)}}
@keyframes dva-avatar-state-subdued{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.003)}}
@keyframes dva-avatar-state-resting{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.006)}}
@keyframes dva-bubble-pop{from{opacity:0;transform:translate(-50%,-88%) scale(.92)}to{opacity:1;transform:translate(-50%,-100%) scale(1)}}
@keyframes dva-avatar-shadow{0%,100%{transform:scaleX(1);opacity:.45}50%{transform:scaleX(.82);opacity:.25}}
@keyframes dva-pet-idle{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-3px) rotate(.35deg)}}
@media(prefers-reduced-motion:reduce){.dva-pet img,.dva-avatar-stage img,.dva-avatar-stage::after,.dva-avatar-bubble{animation:none!important;transition:none!important}}
@media(max-width:760px){.dva-panel{inset:2vh 2vw}.dva-head{padding:12px}.dva-head-tools{gap:6px}.dva-more-trigger,.dva-collapse{padding:7px 10px}.dva-more-menu{width:min(330px,88vw)}.dva-main{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.dva-character{display:grid;grid-template-columns:64px minmax(0,1fr);grid-template-rows:auto auto auto;align-items:center;justify-content:stretch;padding:10px;gap:8px}.dva-avatar-stage{grid-column:1;grid-row:1;width:64px;height:64px}.dva-avatar-stage img{width:64px;height:64px;max-height:none}.dva-avatar-stage::after{display:none}.dva-avatar-status{left:50%;bottom:-12px;font-size:9px;padding:2px 6px}.dva-avatar-bubble{top:0;left:0;transform:translate(0,-100%);max-width:min(220px,72vw);font-size:10px;padding:4px 7px;animation-name:dva-bubble-pop-mobile}.dva-avatar-bubble::after{left:30px}.dva-avatar-hint{display:none}.dva-stats{text-align:left;font-size:11px}.dva-state-strip{grid-column:1/-1;justify-content:flex-start;max-width:none;margin-top:0}.dva-state-label{text-align:left}.dva-scene-toggle{grid-column:1/-1;max-width:none;margin-top:0}.dva-chat{padding:12px}.dva-input{gap:6px}.dva-starter{padding:6px 9px}}
@keyframes dva-bubble-pop-mobile{from{opacity:0;transform:translate(0,-88%) scale(.92)}to{opacity:1;transform:translate(0,-100%) scale(1)}}
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

function describeCharacterState(state = {}, presentation = {}) {
  const anxiety = Math.max(0, Math.min(1, Number(state.anxiety) || 0))
  const grief = Math.max(0, Math.min(1, Number(state.grief) || 0))
  const anger = Math.max(0, Math.min(1, Number(state.anger) || 0))
  const embarrassment = Math.max(0, Math.min(1, Number(state.embarrassment) || 0))
  const mood = presentation.mood || (anger >= 0.65 ? '有些不开心' : grief >= 0.60 ? '有点低落' : anxiety >= 0.65 ? '略显紧张' : '平静')
  const shyness = presentation.shyness || (embarrassment >= 0.70 ? '很害羞' : embarrassment >= 0.35 ? '有点害羞' : '自然')
  return { mood, shyness }
}


const MAX_MOTION_PREVIEW_FILES = 1200
const MAX_MOTION_PREVIEW_BYTES = 64 * 1024 * 1024
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10]

async function readDyberPetPreviewFolder(files) {
  const selected = Array.from(files || [])
  if (!selected.length) throw new Error('请选择包含 pet_conf.json、act_conf.json 和 action 文件夹的角色目录。')
  if (selected.length > MAX_MOTION_PREVIEW_FILES + 20) throw new Error('动作文件过多，请选择较小的角色包（最多 1200 帧）。')
  const entries = selected.map(file => ({
    file,
    path: String(file.webkitRelativePath || file.name || '').replaceAll('\\', '/'),
  }))
  const configs = entries.filter(item => item.path.endsWith('/pet_conf.json') || item.path === 'pet_conf.json')
  if (configs.length !== 1) throw new Error('请选择一个角色目录，且目录中必须只有一份 pet_conf.json。')
  const root = configs[0].path.slice(0, -'pet_conf.json'.length)
  const act = entries.find(item => item.path === root + 'act_conf.json')
  if (!act) throw new Error('缺少 act_conf.json，请选择完整的 DyberPet 角色目录。')
  if (configs[0].file.size > 64 * 1024 || act.file.size > 64 * 1024) {
    throw new Error('动作配置文件不能超过 64 KB。')
  }
  const frames = entries
    .filter(item => item.path.startsWith(root + 'action/'))
    .map(item => ({ file: item.file, path: item.path.slice(root.length) }))
  if (!frames.length) throw new Error('没有找到 action 文件夹中的 PNG 动作帧。')
  if (frames.length > MAX_MOTION_PREVIEW_FILES) throw new Error('动作帧超过 1200 张，请减少帧数后重新选择。')
  if (frames.reduce((sum, item) => sum + item.file.size, 0) > MAX_MOTION_PREVIEW_BYTES) {
    throw new Error('预览素材超过 64 MB，请先缩减角色动画资源。')
  }
  for (const item of frames) {
    if (!/^action\/[A-Za-z0-9_-]+_[0-9]+\.png$/i.test(item.path) || !item.file.size || item.file.size > 6 * 1024 * 1024) {
      throw new Error('动作帧文件名或大小异常：' + item.path)
    }
  }
  const signatures = await Promise.all(frames.map(async item => {
    const data = new Uint8Array(await item.file.slice(0, 8).arrayBuffer())
    return data.length === PNG_MAGIC.length && PNG_MAGIC.every((value, index) => data[index] === value)
  }))
  const invalid = signatures.findIndex(value => !value)
  if (invalid >= 0) throw new Error('动作帧不是有效的 PNG 文件：' + frames[invalid].path)
  let petConfig
  let actConfig
  try {
    petConfig = JSON.parse(await configs[0].file.text())
    actConfig = JSON.parse(await act.file.text())
  } catch {
    throw new Error('角色配置不是有效 JSON，请检查 pet_conf.json 与 act_conf.json。')
  }
  return {
    roleName: root.split('/').filter(Boolean).at(-1) || '本地角色',
    petConfig,
    actConfig,
    frameFiles: frames.map(item => item.path),
    frameEntries: frames,
  }
}

function Companion() {
  const [view, setView] = useState(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [avatarMotion, setAvatarMotion] = useState('idle')
  const [avatarBubble, setAvatarBubble] = useState('')
  const [avatarExpressionOverride, setAvatarExpressionOverride] = useState(null)
  const [sceneBusy, setSceneBusy] = useState(false)
  const [error, setError] = useState('')
  const [memories, setMemories] = useState([])
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memoryLevel, setMemoryLevel] = useState('all')
  const [memoryPinned, setMemoryPinned] = useState('all')
  const [backups, setBackups] = useState([])
  const [activePanel, setActivePanel] = useState(null)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [notice, setNotice] = useState('')
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
  const [relationshipEvents, setRelationshipEvents] = useState([])
  const [memoryCandidates, setMemoryCandidates] = useState([])
  const [storyMemory, setStoryMemory] = useState(null)
  const [summaryCandidate, setSummaryCandidate] = useState(null)
  const [profileDraft, setProfileDraft] = useState({})
  const [motionPreview, setMotionPreview] = useState(null)
  const [motionPreviewBusy, setMotionPreviewBusy] = useState(false)
  const [motionPreviewError, setMotionPreviewError] = useState('')
  const [motionActionId, setMotionActionId] = useState('')
  const [motionPlaybackStep, setMotionPlaybackStep] = useState(0)
  const [motionPlaying, setMotionPlaying] = useState(false)
  const motionRequestRef = React.useRef(0)

  const loadMotionPreview = async fileList => {
    const selected = Array.from(fileList || [])
    if (!selected.length) return
    const requestId = ++motionRequestRef.current
    setMotionPreviewBusy(true)
    setMotionPreviewError('')
    setMotionPlaying(false)
    setMotionPreview(null)
    try {
      const folder = await readDyberPetPreviewFolder(selected)
      if (requestId !== motionRequestRef.current) return
      const checked = await callApi('motion-preview-validate', {
        petConfig: folder.petConfig,
        actConfig: folder.actConfig,
        frameFiles: folder.frameFiles,
      })
      if (requestId !== motionRequestRef.current) return
      if (!checked.previewOnly || !checked.catalog?.actions) throw new Error('动作预览校验返回格式异常。')
      const filesByPath = new Map(folder.frameEntries.map(item => [item.path, item.file]))
      const urls = {}
      try {
        for (const action of Object.values(checked.catalog.actions)) {
          for (const path of action.frames || []) {
            if (urls[path]) continue
            const file = filesByPath.get(path)
            if (!file) throw new Error('缺少动作帧：' + path)
            urls[path] = URL.createObjectURL(file)
          }
        }
      } catch (error) {
        Object.values(urls).forEach(url => URL.revokeObjectURL(url))
        throw error
      }
      const ids = Object.keys(checked.catalog.actions)
      if (!ids.length) {
        Object.values(urls).forEach(url => URL.revokeObjectURL(url))
        throw new Error('角色配置中没有可以播放的动作。')
      }
      if (requestId !== motionRequestRef.current) {
        Object.values(urls).forEach(url => URL.revokeObjectURL(url))
        return
      }
      setMotionPreview({ roleName: folder.roleName, catalog: checked.catalog, frameUrls: urls })
      setMotionActionId(checked.catalog.defaultAction || ids[0])
      setMotionPlaybackStep(0)
    } catch (error) {
      if (requestId === motionRequestRef.current) setMotionPreviewError(error.message || String(error))
    } finally { if (requestId === motionRequestRef.current) setMotionPreviewBusy(false) }
  }

  const openUtilityPanel = panel => {
    setActivePanel(panel)
    setShowMoreMenu(false)
    setError('')
    setNotice('')
  }

  const closeUtilityPanel = () => {
    setActivePanel(null)
    setShowMoreMenu(false)
    setError('')
  }

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

  useEffect(() => {
    if (!open) return
    const onKeyDown = event => {
      if (event.key !== 'Escape') return
      if (showMoreMenu) setShowMoreMenu(false)
      else if (activePanel) setActivePanel(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, showMoreMenu, activePanel])

  useEffect(() => {
    if (avatarMotion !== 'responding' && avatarMotion !== 'patting') return
    const delay = avatarMotion === 'patting' ? 1250 : 1500
    const timer = window.setTimeout(() => {
      setAvatarMotion('idle')
      setAvatarBubble('')
      setAvatarExpressionOverride(null)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [avatarMotion])

  useEffect(() => {
    if (!open || busy || activePanel || avatarMotion !== 'idle') return
    // A quiet, infrequent body sway makes the portrait feel present without
    // interrupting typing, reading utility panels or an active model turn.
    const timer = window.setTimeout(() => setAvatarMotion('swaying'), 24000)
    return () => window.clearTimeout(timer)
  }, [open, busy, activePanel, avatarMotion])

  useEffect(() => {
    if (avatarMotion !== 'swaying') return
    const timer = window.setTimeout(() => setAvatarMotion('idle'), 1400)
    return () => window.clearTimeout(timer)
  }, [avatarMotion])

  useEffect(() => () => {
    if (motionPreview?.frameUrls) {
      Object.values(motionPreview.frameUrls).forEach(url => URL.revokeObjectURL(url))
    }
  }, [motionPreview])

  useEffect(() => {
    if (activePanel === 'motion') return
    motionRequestRef.current += 1
    setMotionPreviewBusy(false)
    setMotionPlaying(false)
    setMotionPreview(previous => previous ? null : previous)
  }, [activePanel])

  useEffect(() => {
    const action = motionPreview?.catalog?.actions?.[motionActionId]
    if (!motionPlaying || activePanel !== 'motion' || !action?.frames?.length) return
    const totalSteps = action.frames.length * action.repeats
    if (motionPlaybackStep >= totalSteps - 1) {
      setMotionPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setMotionPlaybackStep(step => step + 1),
      Math.max(30, action.frameIntervalMs))
    return () => window.clearTimeout(timer)
  }, [motionPlaying, activePanel, motionPreview, motionActionId, motionPlaybackStep])

  const patAvatar = () => {
    if (busy || avatarMotion === 'thinking') return
    setAvatarMotion('patting')
    setAvatarExpressionOverride(view?.character?.presentation?.patExpression || 'shy')
    setAvatarBubble(view?.character?.presentation?.patReply || '嘿嘿，主人摸摸我啦～')
  }

  const send = useCallback(async (message, choiceId) => {
    const clean = String(message || '').trim()
    if (!clean || busy) return
    setBusy(true)
    setAvatarBubble('')
    setAvatarExpressionOverride(null)
    setAvatarMotion('thinking')
    setError('')
    setNotice('')
    try {
      const result = await callApi('chat', { text: clean, choiceId })
      setView(result.view)
      setAvatarMotion('responding')
      setText(current => current === clean ? '' : current)
      if (!choiceId) {
        try {
          const suggestions = await callApi('memory-candidates', { text: clean })
          setMemoryCandidates(suggestions.candidates || [])
        } catch {
          setNotice('消息已发送，但暂时无法生成记忆建议。')
        }
      }
    } catch (err) {
      setAvatarMotion('idle')
      setAvatarBubble('')
      setAvatarExpressionOverride(null)
      setError(err.message || String(err))
    }
    finally { setBusy(false) }
  }, [busy])

  const setInteractionScene = async scene => {
    if (sceneBusy || busy || character?.interactionScene === scene) return
    setSceneBusy(true)
    setError('')
    try {
      const result = await callApi('scene-set', { scene })
      setView(result.view)
    } catch (err) { setError(err.message || String(err)) }
    finally { setSceneBusy(false) }
  }

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
    setShowMoreMenu(false)
    setHistorySearchLoading(true)
    try {
      const result = await callApi('history-search', { query: historyQuery })
      setHistoryMatches(result.matches || [])
      setActivePanel('history')
    } catch (err) { setActivePanel(null); setError(err.message || String(err)) }
    finally { setHistorySearchLoading(false) }
  }

  const loadRelationshipHistory = async () => {
    setShowMoreMenu(false)
    setRelationshipLoading(true)
    try {
      const result = await callApi('relationship-history', { limit: 50 })
      setRelationshipEvents(result.events || [])
      setActivePanel('relationship')
    } catch (err) { setActivePanel(null); setError(err.message || String(err)) }
    finally { setRelationshipLoading(false) }
  }

  const loadSummaryCandidate = async () => {
    setShowMoreMenu(false)
    try {
      const result = await callApi('summary-candidate')
      setSummaryCandidate(result.candidate)
      setActivePanel('summary')
    } catch (err) { setActivePanel(null); setError(err.message || String(err)) }
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
      setActivePanel(null)
      setNotice('长期相处摘要已更新。')
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
    setActivePanel('diagnostics')
    setShowMoreMenu(false)
    setDiagnosticsBusy(true)
    try {
      const result = await callApi('diagnostics')
      setDiagnostics(result.diagnostics)
    } catch (err) { setActivePanel(null); setError(err.message || String(err)) }
    finally { setDiagnosticsBusy(false) }
  }

  const loadBackups = async () => {
    setActivePanel('backups')
    setShowMoreMenu(false)
    try {
      const result = await callApi('backup-list')
      setBackups(result.backups || [])
    } catch (err) { setActivePanel(null); setError(err.message || String(err)) }
  }

  const createBackup = async () => {
    setBackupBusy(true)
    try {
      const result = await callApi('backup-create')
      setError('')
      setNotice('备份已创建：' + result.backup.id)
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
      setError('')
      setNotice('备份恢复完成，已重新加载角色状态。')
      await refresh()
      await loadBackups()
    } catch (err) { setError(err.message || String(err)) }
    finally { setBackupBusy(false) }
  }

  const loadMemories = async (filters = {}) => {
    // Panel visibility belongs to the caller, not this async data loader.
    // If the user returns to chat while the request is pending, completion
    // must never reopen the memory panel.
    setMemoryLoading(true)
    try {
      const result = await callApi('memory-list', {
        query: filters.query ?? memoryQuery,
        level: filters.level ?? memoryLevel,
        pinned: filters.pinned ?? memoryPinned,
      })
      setMemories(result.memories || [])
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
  const relationshipStage = character?.relationship?.stage || 'acquaintance'
  const relationshipStageLabel = character?.relationship?.stageLabel || ({ stranger: '陌生', acquaintance: '初识', colleague: '熟悉', trusted: '信任', close: '亲近', confession: '告白中', lover: '恋人', bonded: '深厚羁绊' }[relationshipStage] || '初识')
  const interactionScene = character?.interactionScene || 'PRIVATE_HOME'
  const hasConversation = lines.length > 0
  const pplState = character?.pplState || {}
  const characterState = describeCharacterState(pplState, character?.presentation || {})
  const motionAction = motionPreview?.catalog?.actions?.[motionActionId] || null
  const motionFrame = motionAction?.frames?.[motionPlaybackStep % (motionAction.frames.length || 1)] || null
  const motionFrameUrl = motionFrame ? motionPreview?.frameUrls?.[motionFrame] : null
  const chatGroups = lines.reduce((groups, line, index) => {
    const timestamp = Number(line.at || 0)
    const day = timestamp > 0 ? new Date(timestamp).toLocaleDateString() : '时间未知'
    const last = groups[groups.length - 1]
    if (!last || last.day !== day) groups.push({ day, rows: [] })
    groups[groups.length - 1].rows.push({ ...line, key: index })
    return groups
  }, [])
  return React.createElement('section', {
    className: 'dva-panel',
    role: 'dialog',
    'aria-label': 'DeepSeek 鲸鱼娘',
    onClick: event => {
      if (showMoreMenu && !event.target?.closest?.('.dva-head-tools')) setShowMoreMenu(false)
    },
    style: { backgroundImage: character?.backgroundUrl ? 'linear-gradient(180deg,rgba(4,15,29,.88),rgba(4,15,29,.94)),url(' + character.backgroundUrl + ')' : undefined, backgroundSize: 'cover', backgroundPosition: 'center' } },
    React.createElement('header', { className: 'dva-head' },
      React.createElement('div', null,
        React.createElement('div', { className: 'dva-title' }, character?.name || 'DeepSeek 鲸鱼娘'),
        React.createElement('div', { className: 'dva-sub' },
          interactionScene === 'PUBLIC_SPACE' ? '公开场合 · 保持自然与分寸' : '私密陪伴 · 按你们的关系自然互动',
        ),
      ),
      React.createElement('div', { className: 'dva-head-tools' },
        React.createElement('button', {
          className: 'dva-more-trigger',
          'aria-expanded': showMoreMenu,
          'aria-haspopup': 'menu',
          onClick: () => setShowMoreMenu(value => !value),
        }, '更多 ▾'),
        React.createElement('button', { className: 'dva-collapse', onClick: () => { setShowMoreMenu(false); setOpen(false) } }, '收起'),
        showMoreMenu ? React.createElement('div', { className: 'dva-more-menu', role: 'menu' },
          React.createElement('div', { className: 'dva-menu-group' },
            React.createElement('strong', null, '对话与关系'),
            React.createElement('div', { className: 'dva-menu-grid' },
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', onClick: () => openUtilityPanel('history') }, '搜索对话'),
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', disabled: relationshipLoading, onClick: () => void loadRelationshipHistory() }, relationshipLoading ? '读取关系记录…' : '关系记录'),
            ),
          ),
          React.createElement('div', { className: 'dva-menu-group' },
            React.createElement('strong', null, '记忆管理'),
            React.createElement('div', { className: 'dva-menu-grid' },
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', disabled: memoryLoading, onClick: () => { openUtilityPanel('memories'); void loadMemories() } }, memoryLoading ? '读取记忆…' : '查看记忆'),
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', onClick: () => void loadSummaryCandidate() }, '整理长期摘要'),
            ),
          ),
          React.createElement('div', { className: 'dva-menu-group' },
            React.createElement('strong', null, '角色与外观'),
            React.createElement('div', { className: 'dva-menu-grid' },
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', onClick: async () => {
                setShowMoreMenu(false)
                try {
                  const result = await callApi('profile-get')
                  setProfileDraft(result.profile)
                  openUtilityPanel('profile')
                } catch (err) { setError(err.message || String(err)) }
              } }, '角色设定'),
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', onClick: async () => {
                setShowMoreMenu(false)
                try {
                  const next = character?.backgroundUrl?.includes('bg-deepseek-seaside-study') ? 'palace-night' : 'bg-deepseek-seaside-study'
                  const result = await callApi('background-set', { background: next })
                  setView(result.view)
                  setNotice('背景已切换。')
                } catch (err) { setError(err.message || String(err)) }
              } }, '切换背景'),
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', onClick: () => openUtilityPanel('motion') }, '动作包预览'),
            ),
          ),
          React.createElement('div', { className: 'dva-menu-group' },
            React.createElement('strong', null, '数据与支持'),
            React.createElement('div', { className: 'dva-menu-grid' },
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', disabled: backupBusy, onClick: () => void loadBackups() }, '备份与恢复'),
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', disabled: diagnosticsBusy, onClick: () => void loadDiagnostics() }, '运行诊断'),
              React.createElement('button', { className: 'dva-menu-item', role: 'menuitem', onClick: () => { setShowMoreMenu(false); void refresh() } }, '刷新状态'),
            ),
          ),
        ) : null,
      ),
    ),
    React.createElement('div', { className: 'dva-main' },
      React.createElement('aside', { className: 'dva-character' },
        React.createElement('div', {
          className: 'dva-avatar-stage is-' + avatarMotion + ' is-state-' + (character?.presentation?.motion || 'calm'),
          'data-expression': character?.presentation?.expression || 'neutral',
          'data-expression-source': character?.presentation?.expressionSource || 'baseline',
          'data-tempo': character?.presentation?.tempo || 'normal',
          role: 'button',
          tabIndex: 0,
          title: '当前表情：' + (character?.presentation?.expressionLabel || '自然') + '；点击摸摸鲸鱼娘',
          'aria-label': avatarMotion === 'thinking' ? '鲸鱼娘正在思考' : avatarMotion === 'patting' ? '摸摸鲸鱼娘' : avatarMotion === 'responding' ? '鲸鱼娘正在回应' : '鲸鱼娘当前表情：' + (character?.presentation?.expressionLabel || '自然') + '；点击摸摸鲸鱼娘',
          onClick: patAvatar,
          onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              patAvatar()
            }
          },
        },
          React.createElement('img', {
            key: avatarExpressionOverride || character?.imageUrl || 'default-avatar',
            src: avatarExpressionOverride
              ? character?.expressionUrls?.[avatarExpressionOverride] || character?.imageUrl || API + '/assets/maid-left.webp'
              : character?.imageUrl || API + '/assets/maid-left.webp',
            alt: character?.name || '鲸鱼娘',
            draggable: false,
          }),
          avatarMotion === 'thinking' ? React.createElement('span', { className: 'dva-avatar-status', role: 'status' }, '正在思考…') : null,
          avatarBubble ? React.createElement('span', { className: 'dva-avatar-bubble', role: 'status' }, avatarBubble) : null,
        ),
        React.createElement('small', { className: 'dva-avatar-hint' }, '点击立绘，可以摸摸鲸鱼娘'),
        React.createElement('div', { className: 'dva-stats' },
          'Lv.' + (character?.level || 1) + ' · 好感度 ' + (character?.affection || 0) + '/' + (character?.affectionCap || 30),
          React.createElement('br'),
          '关系：' + relationshipStageLabel + ' · 信任 ' + Math.round((character?.relationship?.trust || 0) * 100) + '%',
          React.createElement('br'),
          '亲近度 ' + Math.round((character?.relationship?.attachment || 0) * 100) + '%',
          React.createElement('br'),
          React.createElement('small', null, '好感度用于等级成长；信任与亲近度共同影响关系阶段。'),
        ),
        React.createElement('div', {
          className: 'dva-state-strip',
          title: '这里展示鲸鱼娘在互动中的状态，不代表对主人的情绪或健康评估。',
          'aria-label': '鲸鱼娘当前互动状态',
        },
          React.createElement('span', { className: 'dva-state-label' }, '鲸鱼娘现在的状态'),
          React.createElement('span', { className: 'dva-state-chip' }, '心情 · ', React.createElement('b', null, characterState.mood)),
          React.createElement('span', { className: 'dva-state-chip' }, '害羞 · ', React.createElement('b', null, characterState.shyness)),
        ),
        React.createElement('div', { className: 'dva-scene-toggle' },
          React.createElement('div', { className: 'dva-scene-title' }, '互动场合'),
          React.createElement('div', { className: 'dva-scene-options' },
            React.createElement('button', {
              className: 'dva-scene-option' + (interactionScene === 'PRIVATE_HOME' ? ' active' : ''),
              disabled: sceneBusy || busy,
              'aria-pressed': interactionScene === 'PRIVATE_HOME',
              onClick: () => void setInteractionScene('PRIVATE_HOME'),
            }, '私密空间'),
            React.createElement('button', {
              className: 'dva-scene-option' + (interactionScene === 'PUBLIC_SPACE' ? ' active' : ''),
              disabled: sceneBusy || busy,
              'aria-pressed': interactionScene === 'PUBLIC_SPACE',
              onClick: () => void setInteractionScene('PUBLIC_SPACE'),
            }, '公开场合'),
          ),
          React.createElement('small', { className: 'dva-scene-hint' },
            interactionScene === 'PUBLIC_SPACE'
              ? '有人在场时，鲸鱼娘会保持自然、礼貌和适当分寸。'
              : '私下相处时，鲸鱼娘会按照你们的关系自然表达。',
          ),
          sceneBusy ? React.createElement('small', { className: 'dva-scene-hint' }, '正在保存场景设置…') : null,
        ),
      ),
      React.createElement('div', { className: 'dva-chat' },
        ['history', 'relationship'].includes(activePanel)
          ? React.createElement('div', { className: 'dva-utility-overlay' },
              activePanel === 'history' ? React.createElement('div', { className: 'dva-memory-panel' },
                React.createElement('strong', null, '搜索对话'),
                React.createElement('small', null, '输入关键词查找过去的聊天记录，至少两个字。'),
                React.createElement('input', { value: historyQuery, placeholder: '输入要查找的内容', onChange: event => setHistoryQuery(event.target.value) }),
                React.createElement('button', { disabled: historySearchLoading || historyQuery.trim().length < 2, onClick: () => void searchHistory() }, historySearchLoading ? '搜索中…' : '搜索'),
                ...historyMatches.map(item => React.createElement('div', { key: item.index, className: 'dva-memory-row' }, '[' + (item.who || item.role || '') + '] ' + item.text)),
                historyMatches.length === 0 ? React.createElement('small', null,
                  historyQuery.trim().length < 2 ? '输入至少两个字后搜索。' : '没有找到匹配的对话，可以换个关键词试试。',
                ) : null,
                React.createElement('button', { onClick: () => setActivePanel(null) }, '关闭搜索'),
              ) : null,
              activePanel === 'relationship' ? React.createElement('div', { className: 'dva-memory-panel' },
                React.createElement('strong', null, '关系变化记录'),
                relationshipEvents.length === 0 ? React.createElement('p', null, '目前还没有关系变化记录。随着你们的互动，这里会显示关系阶段和成长变化。') : null,
                ...relationshipEvents.map(item => React.createElement('div', { key: item.id, className: 'dva-memory-row' },
                  React.createElement('strong', null, item.label || item.type),
                  React.createElement('div', null, new Date(item.createdAt).toLocaleString()),
                  item.details?.affectionDelta ? React.createElement('div', null, '好感度变化：' + (item.details.affectionDelta > 0 ? '+' : '') + item.details.affectionDelta) : null,
                  item.details?.levelChanged ? React.createElement('div', null, '等级提升：Lv.' + item.details.levelBefore + ' → Lv.' + item.details.levelAfter) : null,
                  item.details?.stageChanged ? React.createElement('div', null, '关系阶段：' + item.details.stageBefore + ' → ' + item.details.stageAfter) : null,
                  React.createElement('small', null, '信任 ' + Math.round((item.details?.trustBefore || 0) * 100) + '% → ' + Math.round((item.details?.trustAfter || 0) * 100) + '% · 亲近度 ' + Math.round((item.details?.attachmentBefore || 0) * 100) + '% → ' + Math.round((item.details?.attachmentAfter || 0) * 100) + '%'),
                )),
                React.createElement('button', { onClick: () => setActivePanel(null) }, '关闭'),
              ) : null,
            )
          : null,
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
        ),
        ['summary', 'profile', 'diagnostics', 'backups', 'memories', 'motion'].includes(activePanel)
          ? React.createElement('div', { className: 'dva-utility-overlay' },

        activePanel === 'motion' ? React.createElement('div', { className: 'dva-memories dva-motion-panel' },
          React.createElement('div', { className: 'dva-motion-head' },
            React.createElement('strong', null, '本地动作包预览'),
            React.createElement('button', { type: 'button', className: 'dva-panel-back', onClick: closeUtilityPanel }, '← 返回聊天'),
          ),
          React.createElement('small', { className: 'dva-motion-help' },
            '选择 DyberPet 角色文件夹（包含 pet_conf.json、act_conf.json 和 action 子目录）。先查看动作是否完整、形象是否匹配，再决定是否制作正式安装包。',
          ),
          React.createElement('label', { className: 'dva-motion-picker' },
            '选择本地角色文件夹',
            React.createElement('input', {
              type: 'file',
              webkitdirectory: '',
              directory: '',
              multiple: true,
              disabled: motionPreviewBusy,
              'aria-label': '选择 DyberPet 角色文件夹',
              onChange: event => {
                const files = Array.from(event.target.files || [])
                event.target.value = ''
                void loadMotionPreview(files)
              },
            }),
          ),
          React.createElement('small', { className: 'dva-motion-note' },
            '仅发送配置和帧文件名到本地 DSH 插件进行校验；PNG 留在当前浏览器中预览，不上传、不保存、不替换鲸鱼娘。',
          ),
          motionPreviewBusy ? React.createElement('div', { role: 'status' }, '正在验证角色配置与 PNG 帧…') : null,
          motionPreviewError ? React.createElement('div', { role: 'alert', className: 'dva-motion-error' }, motionPreviewError) : null,
          motionPreview ? React.createElement(React.Fragment, null,
            React.createElement('strong', null, '已识别：' + motionPreview.roleName),
            React.createElement('small', null,
              '动作 ' + Object.keys(motionPreview.catalog.actions).length +
              ' 种 · 可用 PNG 帧 ' + Object.keys(motionPreview.frameUrls).length + ' 张',
            ),
            React.createElement('div', { className: 'dva-motion-row' },
              React.createElement('label', null, '选择动作 '),
              React.createElement('select', {
                value: motionActionId,
                'aria-label': '选择要预览的动作',
                onChange: event => { setMotionActionId(event.target.value); setMotionPlaybackStep(0); setMotionPlaying(false) },
              },
                ...Object.keys(motionPreview.catalog.actions).map(id =>
                  React.createElement('option', { key: id, value: id }, id),
                ),
              ),
              React.createElement('button', {
                type: 'button',
                disabled: !motionAction,
                onClick: () => {
                  if (motionPlaying) setMotionPlaying(false)
                  else { if (motionAction && motionPlaybackStep >= motionAction.frameCount * motionAction.repeats - 1) setMotionPlaybackStep(0); setMotionPlaying(true) }
                },
              }, motionPlaying ? '暂停' : '播放动作'),
              React.createElement('button', { type: 'button', onClick: () => { setMotionPlaying(false); setMotionPlaybackStep(0) } }, '从头预览'),
            ),
            motionAction ? React.createElement('small', { className: 'dva-motion-note' },
              '每轮 ' + motionAction.frameCount + ' 帧 · 重复 ' + motionAction.repeats +
              ' 次 · 每帧 ' + motionAction.frameIntervalMs + ' 毫秒 · 总时长 ' +
              (motionAction.durationMs / 1000).toFixed(1) + ' 秒',
            ) : null,
            React.createElement('div', { className: 'dva-motion-stage', 'aria-label': '动作帧预览' },
              motionFrameUrl
                ? React.createElement('img', { src: motionFrameUrl, alt: motionPreview.roleName + ' 动作预览', draggable: false })
                : React.createElement('small', null, '选择动作后显示对应帧'),
            ),
            React.createElement('small', { className: 'dva-motion-note' },
              '动作包目前仅供本地预览。退出此界面后自动释放预览资源，不会安装角色或改变现有聊天与记忆。',
            ),
          ) : null,
        ) : null,
        activePanel === 'summary' ? React.createElement('div', { className: 'dva-memories' },
          React.createElement('strong', null, '长期相处摘要'),
          summaryCandidate?.summary
            ? React.createElement(React.Fragment, null,
                React.createElement('p', null, summaryCandidate.summary),
                React.createElement('small', null, summaryCandidate.warning),
                React.createElement('button', { disabled: busy, onClick: () => void confirmSummary() }, '确认更新摘要'),
              )
            : React.createElement('p', null, '目前还没有足够的对话和记忆生成摘要。继续自然聊天，之后再来整理即可。'),
          React.createElement('button', { onClick: () => { setSummaryCandidate(null); setActivePanel(null) } }, '关闭'),
        ) : null,
        activePanel === 'profile' ? React.createElement('div', { className: 'dva-memories' },
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
              setActivePanel(null)
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
          React.createElement('button', { onClick: () => setActivePanel(null) }, '取消'),
        ) : null,
        activePanel === 'diagnostics' ? React.createElement('div', { className: 'dva-memories' },
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
          React.createElement('button', { onClick: () => setActivePanel(null) }, '关闭诊断'),
        ) : null,
        activePanel === 'backups' ? React.createElement('div', { className: 'dva-memories' },
          React.createElement('strong', null, '本地备份与恢复'),
          React.createElement('p', null, '备份会保存鲸鱼娘的角色状态、记忆和媒体资源。建议在升级或迁移前创建备份。'),
          React.createElement('button', { disabled: backupBusy, onClick: () => void createBackup() }, backupBusy ? '处理中…' : '立即创建备份'),
          backups.length === 0 ? React.createElement('small', null, '还没有本地备份。') : null,
          ...backups.map(item => React.createElement('div', { key: item.id, className: 'dva-memory-row' },
            item.id + ' · ' + (item.createdAt || '清单异常'),
            React.createElement('button', { disabled: backupBusy || item.valid === false, onClick: () => void restoreBackup(item.id) }, '校验并恢复'),
          )),
          React.createElement('button', { onClick: () => setActivePanel(null) }, '关闭备份'),
        ) : null,
        activePanel === 'memories' ? React.createElement('div', { className: 'dva-memories' },
            React.createElement('div', { className: 'dva-memory-head' },
              React.createElement('div', null,
                React.createElement('strong', null, '鲸鱼娘的长期记忆'),
                React.createElement('small', null, '这些内容用于保持你们后续对话的连续性。你可以编辑、置顶或删除。'),
              ),
              React.createElement('button', {
                type: 'button',
                className: 'dva-panel-back',
                'aria-label': '返回聊天',
                onClick: closeUtilityPanel,
              }, '← 返回聊天'),
            ),
            React.createElement('div', { className: 'dva-memory-toolbar' },
              React.createElement('input', { value: memoryQuery, placeholder: '搜索记忆内容', 'aria-label': '搜索记忆内容', onChange: event => setMemoryQuery(event.target.value) }),
              React.createElement('select', { value: memoryLevel, 'aria-label': '记忆层级', onChange: event => setMemoryLevel(event.target.value) },
                React.createElement('option', { value: 'all' }, '全部层级'),
                React.createElement('option', { value: 'core' }, '核心记忆'),
                React.createElement('option', { value: 'mid' }, '重要记忆'),
                React.createElement('option', { value: 'edge' }, '普通记忆'),
              ),
              React.createElement('select', { value: memoryPinned, 'aria-label': '置顶状态', onChange: event => setMemoryPinned(event.target.value) },
                React.createElement('option', { value: 'all' }, '全部状态'),
                React.createElement('option', { value: 'pinned' }, '仅置顶'),
                React.createElement('option', { value: 'normal' }, '未置顶'),
              ),
              React.createElement('button', { type: 'button', disabled: memoryLoading, onClick: () => void loadMemories() }, memoryLoading ? '筛选中…' : '筛选'),
              React.createElement('button', { type: 'button', onClick: () => void exportMemories() }, '导出记忆'),
            ),
            React.createElement('small', { className: 'dva-memory-count', role: 'status' },
              memoryLoading ? '正在读取记忆…' : '共显示 ' + memories.length + ' 条记忆',
            ),
            !memoryLoading && memories.length === 0 ? React.createElement('p', { className: 'dva-memory-empty' }, '目前没有符合条件的记忆。你可以调整筛选条件，或在聊天中确认保存新的记忆。') : null,

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
          ) : null,
          ) : null,
        !hasConversation && !busy ? React.createElement('div', { className: 'dva-starters', 'aria-label': '聊天建议' },
          React.createElement('span', { className: 'dva-starters-label' }, '不知道聊什么？可以从这里开始'),
          ...['你好，介绍一下你自己', '今天过得怎么样？', '陪我聊聊天吧'].map(prompt => React.createElement('button', {
            key: prompt,
            type: 'button',
            className: 'dva-starter',
            onClick: () => void send(prompt),
          }, prompt)),
        ) : null,
        error ? React.createElement('div', { className: 'dva-error', role: 'alert' }, error) : null,
        notice ? React.createElement('div', { className: 'dva-notice', role: 'status' }, notice) : null,
        React.createElement('form', { className: 'dva-input', onSubmit: event => { event.preventDefault(); void send(text) } },
          React.createElement('input', {
            value: text,
            maxLength: 500,
            'aria-label': '发送给鲸鱼娘',
            autoComplete: 'off',
            placeholder: '输入消息，按 Enter 发送…',
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
