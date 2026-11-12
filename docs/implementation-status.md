# DSH Virtual Avatar 实施状态（Companion-first）

更新基线：feat/architecture-baseline / 1228f34c1bdee391ed8324e33fe0e43090ef965e。
本轮工作分支：feat/migration-media-assets；PR #4 目标为开发分支，不直接修改 main。

## 已验收基线

- PR #3 已合并到开发分支，PR #2 已关闭并标记 Superseded。
- GitHub Actions Run #344：Node 22.19.0 与 Node 24 均通过；42 tests passed / 0 failed。
- PR #1 的 post-merge Run #346、#347 以及后续 Run #348 均通过双版本 CI。
- PPL Persona 0.3：编译 0 errors / 0 warnings，生成 IR 与源文件一致。
- 以上属于 CI 与模块级证据，不等同于真实 DSH Web/Desktop 实机验收。

## 模块状态

| 模块 | 状态 | 证据与限制 |
|---|---|---|
| DeepSeek PPL Persona / Runtime | PASS（模块级） | 固定版本编译、人格测试、完成/中断提交门禁 |
| 自由对话 Host API | PASS（mock contract） | 模型流式接口契约与 Origin / Fetch Metadata 测试；真实 DSH provider 尚未实机验证 |
| SQLite 角色状态与事件账本 | PASS（模块级） | 事务、乐观锁、幂等、重启恢复 |
| 角色长期记忆 | PASS（模块级） | owner 隔离、相关检索、相似合并、pin/delete、编辑、JSON 导出、预算 |
| 长期相处摘要 | PASS（模块级） | source hash、revision 检查、用户确认后写入 |
| 关系与好感成长 | PASS（模块级） | PPL trust/attachment/stage；每日正向好感上限已接入真实结算 |
| Whale DeepSeek 迁移 | PARTIAL | 状态导入与原始来源归档；本分支正在补媒体提取与 hash 对账 |
| 备份与迁移回滚 | NOT YET | 需要快照、后续写入冲突检测和安全恢复流程 |
| Web overlay UI | PASS（模块级） | 自由聊天、历史分页、记忆管理、摘要确认、设定、表情与场景切换 |
| 设置/诊断 | PARTIAL | 尚缺完整存储、模型、PPL、最近错误与备份状态诊断页 |
| DSH Web/Desktop 实机资格 | NOT YET | 需要目标 DSH 发行版、真实模型调用和跨会话证据 |
| 安装/升级/卸载 | NOT YET | 需要干净环境与用户数据保留测试 |

## 当前产品边界

- 首发仅启用 DeepSeek 鲸鱼娘。
- 只做自由对话、长期记忆、关系成长和日常陪伴。
- Galgame 章节、分支、结局、游戏选项、小剧场和 CG 不属于首发范围。
- 桌面宠物动画延后，不阻塞陪伴主链路。
- 陪伴人格不接管主 Agent 身份、工具权限或任务执行。

## 本轮：迁移媒体资产提取

目标：
1. 仅提取 DeepSeek 角色和指定全局背景/CG 中的 data URL。
2. 使用内容哈希与白名单 MIME 建立本地媒体资产。
3. 角色状态只保存 asset URI；完整原始 JSON 仍保留在迁移归档。
4. SQLite 提交失败时回收本轮新增文件；读取时重新核验 hash。
5. 对其他角色的媒体明确标记 deferred，不混入 DeepSeek。

## P1 进度补充\n\n- P1-B 已增加记忆编辑与 JSON 导出服务/API/界面；正在等待双版本 CI。\n- 记忆自动候选仍需用户确认；编辑限制 400 字；导出仅包含 DeepSeek 角色记忆。\n- P1-A 安全回滚尚未合入；P1-C 摘要冲突 UI 与 P1-D 完整备份恢复仍未完成。\n\n## P1-D 本地备份恢复实现

- 新增 `dsh-virtual-avatar.backup/1` 备份目录格式。
- SQLite `VACUUM INTO` 一致性快照；媒体资产复制到备份目录。
- manifest 记录 schema、时间、文件大小和 SHA-256。
- 恢复前校验；校验通过后原子替换数据库和媒体目录，失败恢复旧目录。
- Host API：backup-list / backup-create / backup-verify / backup-restore；恢复必须显式确认。
- 新增存储层与 Host API 备份恢复回归，等待 Node 22.19 / 24 CI。

## 下一阶段

1. 完成迁移回滚：快照、后续写入冲突检测、受控恢复。
2. 完成记忆编辑、导出、删除和摘要冲突提示。
3. 补全设置/诊断界面与干净安装、升级、卸载回归。
4. 获取真实 DSH Web/Desktop 环境完成模型流式调用、刷新与跨会话验收。


## P2 implementation log (2026-11-11)

### P2-B: conversation history
- Merged PR #11: bounded conversation search (minimum two characters, maximum 100 matches), paged history API remains available.
- Added overlay search panel and empty-result messaging.
- Added Host API integration tests for matching and short-query rejection.

### P2-A: relationship growth feedback
- Persist completed-turn audit detail: requested/applied affection delta, affection and level before/after, trust and attachment before/after, relationship stage before/after, and stage/level transition flags.
- Relationship timeline filters to completed-turn and explicit affection events and renders meaningful labels, date, deltas and transitions.
- No scoring formulas or PPL relationship rules changed.
- PR #12 contains the explainable event detail and regression coverage; Node 22.19 / 24 CI passed before merge.

### P2-C: memory interaction
- Memory list supports text search, importance level (core/mid/edge), and pinned-state filters.
- UI shows importance, source and last-seen time; retains edit, pin, delete confirmation and export.
- Added API integration tests for search and pin filters.

### P2-D / P2-E: profile and interaction
- Settings fields are grouped into “称呼与互动” and “人格与表达”.
- Each field has Chinese help text, character limit and live character count.
- Added restore-default profile action with confirmation; it does not delete memory or relationship state.
- Added empty states for memory filters and conversation search.

### Validation boundary
- GitHub Actions Node 22.19 / 24 runs are required for every PR.
- UI code is syntax-checked in CI; full visual usability and DSH Web/Desktop real-host behavior still require target-version manual acceptance.


### P2-D / P2-E follow-up
- Profile settings now use Chinese labels and are grouped by interaction/address vs persona/expression.
- Each field displays its allowed character count and guidance text; default profile can be restored without clearing memories or relationship.
- Conversation history now groups messages by local calendar date and displays an explicit empty state.
- Memory and conversation-search panels show actionable empty-result guidance.
- These are UI-only changes except the existing profile-set API; relationship scoring and memory ranking semantics remain unchanged.


## P2 consolidated implementation record (2026-11-11)

### Merged evidence
- PR #11 merged conversation search and relationship-history timeline. Run #399 passed Node 22.19 / 24.
- PR #12 merged explainable relationship deltas and memory search/filters. Run #410 passed Node 22.19 / 24.
- PR #13 merged profile settings grouping, Chinese help/limits, restore-default action, date-grouped history and empty states. Run #418 passed Node 22.19 / 24.
- Merge commits: PR #11 `70dbebdba0d6d4ed50d864eb43a7e159de63c69f`; PR #12 `c1b358ea42de4edff2205d071cf9e1b28e92fefd`; PR #13 `9ec0c1a2e28dc8a09dbde5ac2e61d4df2058c144`.

### P2 interaction follow-up
- Add explicit loading states and disabled actions for history pagination, conversation search, relationship history and memory filters.
- Prevent duplicate concurrent fetches for those panels.
- This PR is UI feedback only; it does not change stored data or relationship scoring.
- Real DSH Web/Desktop visual acceptance remains outstanding.


## P3 runtime diagnostics implementation log (2026-11-11)

- Added a read-only `diagnostics` Host API covering plugin enabled state, selected model/provider IDs, provider availability catalog (no credentials), PPL source/IR/runtime status, SQLite availability and file size, memory/pinned counts, media/backup directory sizes, relationship state, recent successful conversation and last 10 runtime errors.
- Added explicit user-triggered `model-test` action. It sends a minimal “Reply with OK” request with an 8-token cap and 20-second timeout; it does not call companion turn finalization, does not write conversation history, memory or relationship state.
- Added a diagnostics overlay panel with recheck, model connectivity test and JSON diagnostics export.
- Diagnostics omits API keys and provider credentials. Error messages are bounded and redact common API-key patterns before returning/storing.
- Directory size scan skips symbolic links and caps traversal at 10,000 files.
- Added Host integration coverage for provider selection, PPL IR validity, SQLite status, companion status, credential non-disclosure and model-test success.
- Node 22.19 / 24 CI pending.


## P3 runtime diagnostics delivery record (2026-11-11)

### Implemented
- Read-only `diagnostics` API: plugin enable/version, selected model/provider catalog, PPL source/IR/runtime validity, SQLite health/file size, memory/pinned counts, media and backup directory sizes, relationship state, last conversation/successful turn and bounded recent errors.
- Explicit `model-test`: minimal request, max 8 tokens, 20-second timeout; no companion turn finalization and no conversation/memory/relationship persistence.
- Overlay diagnostics panel: recheck, explicit model test, JSON export.
- Privacy: provider credentials/API keys are not included in diagnostics; error strings are bounded and common API-key patterns are redacted. Directory scan skips symbolic links and is capped at 10,000 files.
- Host integration test covers selected provider, PPL IR validity, SQLite availability, relationship state, credential non-disclosure and model-test success.

### CI evidence
- Run #435: Node 22.19 / Node 24 PASS for diagnostics and model-test test contract.
- A final follow-up commit redacts credentials from model-test failure messages; Run #436 is the acceptance run for that exact head.
- Real DSH provider connectivity and Web/Desktop visual acceptance remain host-environment tests, not inferred from mocks.


## P4 implementation record (2026-11-11)

### Completed in code
- Added `npm run pack:check` to inspect the actual npm pack dry-run manifest.
- Added `scripts/verify-pack.mjs` to require the Cordis entry, Web client, Host implementation, SQLite store, DeepSeek PPL source/IR, art assets, bundle patch and README.
- Package audit rejects test sources, GitHub workflow internals, PPL compiler checkout and SQLite/database files from the distributed package.
- Added Host lifecycle integration test: route registration is unique, cleanup disposes exactly once, reload re-registers once, and DSH_HOME profile data survives plugin instance replacement.
- Added P4 qualification protocol for Web and Desktop with explicit evidence fields and no mock-to-real-host equivalence.

### Not yet qualified
- No target DSH Web/Desktop build/version has been supplied or exercised in this environment.
- The package declares `dsh.client.platform: web`; Desktop support must be verified against the target Desktop release, not assumed.
- Real provider streaming, offline failure behavior, browser reload, app restart and real backup restore remain blocked on target host execution.


## DSH 0.2.2-rc.1 compatibility update (2026-11-11)

- User confirmed target DSH version: `0.2.2-rc1` (normalized SemVer `0.2.2-rc.1`).
- Bundle declares `engines.dsh: >=0.2.2-rc.1 <0.2.3-0`; unsupported versions should be rejected by DSH install/startup.
- Runtime requirement raised to Node.js >=24.9.0; CI aligned to Node 24.9.0 / 24.
- The earlier P4 package/lifecycle check passed on the old Node 22.19 / 24 matrix; this compatibility change requires a fresh Node 24 CI run.
- Real DSH Web/Desktop installation, bundle composition, live model streaming and reload evidence remain pending.


## P4 Windows qualification follow-up (2026-11-11)

- Target confirmed by user: DSH 0.2.2-rc.1, Windows, both Web and Desktop.
- Runtime gate: Node.js >=24.9.0; CI matrix remains 24.9.0 / current 24.
- Clarified compatibility architecture: both Web and Desktop consume the same ordinary `dsh.client.platform: web` client module; Desktop does not require a separate Electron renderer bundle. Host still uses the normal Cordis bundle patch and Web routes.
- Removed undocumented `dsh.client.immediately` metadata.
- Strengthened package audit to assert DSH engine range, Node minimum, Web Client platform, bundle patch and client export.
- Fixed CI generated-asset commit condition to run on Node 24.9.0 (the matrix no longer contains Node 22.19).
- CI now creates an actual installable `.tgz` on Node 24.9.0, copies it into an artifact directory, writes SHA-256 and package-info manifest, and uploads a Windows Web/Desktop install artifact.
- README and test plan now include PowerShell hash verification and separate Web/selected-Desktop-profile install/restart procedures.
- Real Web/Desktop installation remains NOT RUN until artifact is installed in the user's Windows DSH environment and evidence is returned.

## PPL-2 implementation record (2026-11-12)

### Implemented in PR #22
- Separated user stress disclosure and support requests from comfort directed to the character.
- Added deterministic event classes for user stress disclosure, support request, character comfort, rest encouragement and praise.
- Added persistent PPL character emotion state: anxiety, grief, anger and embarrassment; retained physical fatigue as the character's own state.
- Added PPL rules for supportive replies, praise response, comfort, rest encouragement, negative interaction and gradual emotional recovery.
- User stress disclosure/support requests do not award trust, attachment or affection and are not automatically written to long-term memory.
- Only completed model turns commit PPL state. Interrupted and failed turns leave the runtime state unchanged.
- Legacy saves receive missing PPL state defaults without overwriting existing saved values.
- Companion UI and diagnostics expose the character-owned PPL state; UI labels it explicitly to avoid confusion with user mental/health state.

### CI evidence
- Run #531 (43176223043): Node 24.9.0 and Node 24 both PASS.
- Full project tests: 68 passed / 0 failed on both matrix legs.
- PPL Core source compile and embedded persona tests: PASS.
- DSH classic-script client loader regression and npm package verification: PASS.
- Windows Web/Desktop candidate artifact 0.1.0-dev.4 generated.
- Real DSH Desktop 0.2.2-rc.1 installation and visual/streaming behavior remain a separate manual acceptance gate.
## PPL-3 implementation record (2026-11-12)

### Implemented in PR #23
- Extracted a generic PPL 0.3 Persona IR runtime factory.
- Added PersonaRuntimeRegistry with stable ID validation, duplicate/mismatch rejection, safe metadata enumeration, Runtime creation and unregister.
- Runtime instances receive independent Persona IR clones, initial state and session counters; the registry stores definitions only.
- DSH Host now creates the production DeepSeek Whale Runtime through the default Persona Registry.
- Diagnostics exposes registered persona metadata without exposing full mutable IR definitions.
- Added registry tests for default registration, validation failures, missing IDs and cross-persona Runtime/state isolation.
- Only DEEPSEEK_WHALE is currently registered. Additional playable roles, character-specific service/UI switching and migration are not claimed as complete.

### CI evidence
- Run ID 43177485565: Node 24.9.0 and Node 24 both PASS.
- Full project tests: 72 passed / 0 failed on both matrix legs.
- PPL Core compile and embedded Persona tests: PASS.
- Classic DSH client loader and npm package verification: PASS.
- Windows Web/Desktop candidate artifact 0.1.0-dev.5 generated and uploaded to Google Drive.
- Real DSH Desktop 0.2.2-rc.1 installation remains a separate manual qualification gate.