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
## Companion everyday UX implementation record (2026-11-12)

### Implemented in PR #24
- Replaced the crowded header action row with a grouped More menu for conversation/relationship, memory, character/appearance and data/support actions.
- All utility panels now share one active-panel state and a consistent overlay presentation; search, relationship, summary, profile, diagnostics, backup and memory panels have explicit close behavior.
- Added Escape-key dismissal and outside-click dismissal for the More menu.
- Replaced raw PPL state percentages with qualitative character-owned energy/mood/expression labels; renamed the scene control to plain-language interaction setting.
- Simplified relationship summary by removing duplicate stage text and using the user-facing term proximity (`亲近度`).
- Preserved the user's message draft until the chat request succeeds; optional memory suggestion failure no longer makes a successful chat look failed.
- Added empty-state guidance for search, relationship history and backups; successful backup/restore/background operations use neutral status feedback.
- Kept the classic DSH client loader and shared React contract unchanged.

### CI evidence
- Run ID 43187649151: Node 24 and Node 24.9.0 both PASS.
- Full project tests: 72 passed / 0 failed on both matrix legs.
- Classic DSH client loader, UX artifact assertions and npm package verification: PASS.
- Windows Web/Desktop artifact 0.1.0-dev.6 generated.
- Actual visual spacing, keyboard/menu behavior and Desktop 0.2.2-rc.1 model streaming still require real-host acceptance.
## Chat composer and avatar motion record (2026-11-12)

### Implemented in PR #25
- Constrained the companion main grid to a single minmax(0, 1fr) row; the character column scrolls independently so its portrait/status/scene controls cannot push the chat composer below the visible panel.
- Constrained the chat column and history scroll area; the message composer is a non-shrinking footer pinned to the bottom of the visible panel.
- Added first-message suggestions and an explicit Enter-to-send hint.
- Added continuous idle float, model-pending thinking motion/status, and a short response bounce after a successful reply.
- Kept existing emotion-specific portrait switching after completed replies; no lip-sync or skeletal animation is claimed for the static full-body art.
- Added reduced-motion support and regression assertions for the layout, composer, avatar states, starter prompts and keyframes.

### CI evidence
- Run ID 43237458835: Node 24.9.0 and Node 24 both PASS.
- Full project tests: 72 passed / 0 failed on both matrix legs.
- Classic DSH client loader and npm package verification: PASS.
- Windows Web/Desktop artifact `0.1.0-dev.7` generated; `package-info.json` in the ZIP is the authoritative source for exact package size and SHA-256.
- Google Drive file is updated in place, preserving its existing URL; actual DSH Desktop visual acceptance remains pending.
## Memory panel return and DyberPet interaction record (2026-11-12)

### Implemented in PR #26
- Removed panel state changes from the asynchronous memory loader. The menu opens the panel before loading; a late response can no longer reopen a panel after the user has returned to chat.
- Added a persistent `返回聊天` action to the memory panel header and retained Escape dismissal.
- Grouped memory search, level filter, pin filter and export controls; added distinct loading and empty states.
- Added a keyboard-accessible portrait `patpat` interaction using the existing shy portrait, a short bounce and a speech bubble. It is visual-only and does not change affection or relationship scores.
- Added an independently implemented DyberPet native role schema adapter for `pet_conf.json`, `act_conf.json`, numeric PNG frame ordering, frame timing, repeats, movement, anchors, `patpat` tiers and `random_act` validation/playback indexing.
- No unrelated Kitty/ChrisKitty artwork was substituted for the Whale. The current Whale still uses its own portrait assets; real frame-by-frame Whale animation awaits a matching authorized frame package.

### CI evidence
- Run ID `43245577127`: Node 24 and Node 24.9.0 both PASS.
- Full project tests: 76 passed / 0 failed on both matrix legs.
- Classic DSH client loader and npm package verification: PASS.
- DyberPet native motion compatibility tests: PASS.
- Windows Web/Desktop candidate `0.1.0-dev.8` generated; the ZIP includes `package-info.json` and a matching `.sha256` file, which are authoritative for exact package size and checksum.
- Google Drive file updated in place; real DSH Desktop 0.2.2-rc.1 interaction remains a manual acceptance gate.
## PPL-driven expression and autonomous idle behavior record (2026-11-12)

### Implemented in the dev.9 candidate
- Added a read-only Whale presentation resolver: persistent PPL anger/grief/anxiety/embarrassment state overrides the latest one-turn reply expression when thresholds are crossed; overlapping states use strongest normalized intensity.
- Reuses existing licensed Whale expression portraits; no new art or synthetic frames are produced.
- PPL character fatigue selects a slower ambient animation tempo without changing facial expression or exposing fatigue as a user-health measure.
- Added restrained state-specific idle motion and a periodic body sway while the expanded companion is open and idle. It pauses during model turns and utility panels; the collapsed desktop pet also has a gentle float.
- Patting feedback now follows the current PPL-derived expression and remains visual-only; it does not add affection.
- All motion honors `prefers-reduced-motion`; no blink, lip-sync, gaze tracking or rigged animation is claimed.

### Verification added
- Presentation resolver tests cover neutral baseline, reply fallback, shy/angry/serious/frightened states, overlapping state precedence, fatigue tempo and invalid values.
- Host integration test sends eight explicit praise events through the actual chat route and verifies that PPL embarrassment selects the existing shy portrait.
- Client regression checks state-specific animation classes, the 24-second idle scheduler and reduced-motion behavior.

### Acceptance boundary
- This is a PPL-to-existing-art presentation layer, not a new frame-art package. True frame-by-frame Whale movement still requires matching authorized Whale artwork.

## PPL-driven expression and autonomous idle behavior record (2026-11-12)

### Implemented in PR #27 / dev.9
- Added a read-only Whale presentation resolver: persistent PPL anger/grief/anxiety/embarrassment state overrides the latest one-turn reply expression when thresholds are crossed; overlapping states use strongest normalized intensity.
- Reuses existing Whale expression portraits; no new art or synthetic frames are produced.
- Character fatigue selects a slower ambient animation tempo without changing facial expression or representing the user's state.
- Added restrained state-specific idle motion and a periodic body sway while the expanded companion is open and idle. It pauses during model turns and utility panels; the collapsed desktop pet also has a gentle float.
- All motion honors `prefers-reduced-motion`; no blink, lip-sync, gaze tracking or rigged animation is claimed.

### CI evidence
- Workflow Run ID `43250968846`: Node 24 and Node 24.9.0 both PASS.
- Full project tests: 83 passed / 0 failed on both matrix legs.
- PPL compilation, classic DSH client loader and npm package verification: PASS.
- DyberPet native motion tests and memory-return regression remain PASS.

### Windows candidate
- Version: `0.1.0-dev.9`; target: DSH Desktop `0.2.2-rc.1`.
- Windows ZIP CRC test: PASS.
- Exact inner package size and SHA-256 are recorded in the artifact's `package-info.json` and `.sha256` file; both values were independently verified.
- Google Drive file updated in place; existing private file ID and URL retained.

### Acceptance boundary
- This is a PPL-to-existing-art presentation layer, not a new frame-art package. True frame-by-frame Whale movement still requires matching authorized Whale artwork.
- Actual Windows DSH Desktop 0.2.2-rc.1 visual acceptance remains a manual gate.

### dev.11 CI and artifact evidence (2026-11-13)
- Workflow Run `43362357104`: Node 24.9.0 and Node 24 both PASS.
- Full project tests: 96 passed / 0 failed on each matrix leg.
- SQLite persistence/reopen, duplicate detection, hash tamper detection, backup inclusion and restore, uninstall, and interrupted-uninstall recovery: PASS.
- Host binary upload, complete-frame commit, GET frame integrity, diagnostics accounting, incomplete commit rejection and invalid path/PNG rejection: PASS.
- Client classic artifact, explicit import consent, local library preview/uninstall and cancellation/cleanup checks: PASS.
- PPL compile, DSH classic client loader and npm pack verification: PASS.
- Windows artifact `0.1.0-dev.11`: ZIP CRC PASS. The exact inner TGZ byte length and SHA-256 are recorded in `package-info.json` and the adjacent `.sha256` file; both are independently verified.
- Private Google Drive file updated in place; existing file ID and URL retained.

### Remaining manual gate
- dev.9's DSH Desktop baseline was accepted by the user. dev.11's new persistent import, restart persistence, saved-pack preview, backup/restore and uninstall still require real DSH Desktop 0.2.2-rc.1 acceptance.

## Whale native motion binding and PPL runtime integration (dev.12)

### Implemented
- Added a persistent one-active-pack-per-character `motion_pack_bindings` record with explicit identity confirmation, validated action mapping and audit events.
- Added user controls for idle, thinking, responding, patting and resting actions, plus optional mappings for PPL expression states.
- Bound motion actions now drive both the expanded Whale portrait and the collapsed desktop pet. PPL expression, fatigue and local interaction state resolve to an imported native action; missing mappings safely fall back to idle.
- Frame URLs use immutable private caching; the client preloads at most 12 frames for the active action and reads remaining frames on demand.
- Native frame playback honors `prefers-reduced-motion`; unbinding restores the original static Whale expression art. Uninstalling the bound pack cascades the binding removal.

### Verification added
- Storage: confirmation, mapping validation, persistence/reopen, unbind and cascade removal.
- Host: bind/read/unbind, public view mapping, immutable frame reads and cleanup after uninstall.
- Client: PPL/action resolver, fallback rules, interaction action selection, reduced-motion and classic DSH script artifact.

### Acceptance boundary
- Identity confirmation is explicit user attestation, not automatic image recognition. No unrelated character artwork should be bound as the Whale.
- User accepted dev.9 desktop baseline. dev.12 native-frame binding and PPL switching require a fresh DSH Desktop 0.2.2-rc.1 visual test.

### dev.12 CI and Windows artifact evidence (2026-11-13)
- Workflow Run `43375930719`: Node 24 and Node 24.9.0 both PASS.
- Full project tests: 102 passed / 0 failed on each matrix leg.
- Storage/Host/Client tests cover identity confirmation, action mapping, PPL/interaction resolution, binding persistence, unbind, cascade uninstall, frame integrity, reduced-motion and classic DSH client loading.
- PPL compilation, DSH classic-script client loader and npm package verification: PASS.
- Windows artifact `0.1.0-dev.12`: ZIP 3,519,499 bytes; ZIP CRC PASS. Inner TGZ 3,517,804 bytes; SHA-256 `2e5501e1f3975e6262f0633bc41911d03966d967b8c849b8d937643f9caf711e`, verified against `.sha256` and `package-info.json`.
- Private Google Drive file updated in place; existing file ID and URL retained.

### Remaining manual gate
- User accepted dev.9's DSH Desktop baseline. dev.12's explicit identity confirmation, action mapping, actual PPL-driven frame switching, collapsed desktop pet playback, reduced-motion, unbind and restart persistence still require real DSH Desktop 0.2.2-rc.1 verification.
- No matching authorized multi-frame Whale art pack has been supplied in this development thread. Kitty/ChrisKitty assets remain format/playback test material, not Whale art.


## Guided DyberPet motion mapping UX (dev.13)

### Implemented
- Opening a saved native motion pack now proposes mappings from the pack's original default, focus and patpat references, plus conservative exact/common action-name matches for response, rest and PPL expressions.
- Suggestions remain editable and are never activated automatically; the user must still confirm that the artwork matches the Whale and that its use is authorized.
- Action selectors show Chinese semantic labels, original action IDs, frame counts and duration. Selecting a mapping immediately plays that action in the preview area.
- Added an explicit “应用推荐映射” action to restore the proposed mapping without changing the identity-confirmation requirement.

### Verification
- Client unit tests cover native metadata mapping, tiered patpat selection, fallback when action references are missing, readable labels and frame/duration metadata.
- Integrated PR check Run 43378516657: Node 24 and Node 24.9.0 both PASS; each matrix leg reports 105 passed / 0 failed. PPL checks report 7 passed / 0 failed, and npm package verification passes.
- Windows Web/Desktop dev.13 artifact generated. The inner TGZ digest is recorded in both the accompanying .sha256 file and package-info.json; ZIP CRC and package digest were verified during delivery.
- Private Google Drive mirror retains the existing file ID and URL; the stored archive was downloaded back and verified byte-identical to its corresponding PR merge-run artifact.
- Desktop acceptance must confirm the mapping suggestions, action preview, PPL switching, collapsed-pet playback, reduced-motion and unbind behavior.


## Model selection, appearance and guided acceptance UX (dev.14)

### Implemented
- Added a Whale-local model selection record in SQLite. The selected provider/model is used for Whale chat and model connection tests, takes precedence over the DSH process default, and does not call or mutate agentDefaultModel.saveSelection().
- Added model catalog and selection routes. Registered DSH providers are listed through llm.listProviders(); model catalogs are read through llm.listModels() when the host exposes that method. Providers without a catalog can use a manually entered model ID and validate it through the real connection test.
- Added a Whale model settings panel with provider/model selection, save, connection test and reset-to-DSH-default actions. Explicit plugin configuration remains locked and visible.
- Reduced the background overlay from 0.88/0.94 to a configurable range; background choice and overlay strength are persisted in character state and included in backup data.
- Renamed the motion entry to “动作库与动画” and clarified that preview is temporary, import persists locally, and binding is what drives the Whale. Empty-library guidance now explains the required artwork and authorization boundary.
- Added an in-app functional test guide and a repository manual acceptance guide. Chat transport errors now retain provider failure codes and tell users that the current turn did not complete while keeping the draft.

### Verification
- Host route tests cover model catalog discovery, Whale-local selection, chat routing, connection test routing, reset to the DSH default, and rejection of unavailable providers.
- Background route tests cover persistence and rejection of out-of-range overlay values.
- Classic-client tests assert the new model, background and help panels are present in the built DSH script.
- PR check Run 43388360749: Node 24 and Node 24.9.0 both PASS; each matrix leg reports 106 passed / 0 failed. PPL checks report 7 passed / 0 failed; npm package verification passes.
- The dev.14 Windows Web/Desktop artifact is generated by the PR workflow. Its SHA-256 is recorded in the release PR and its companion package-info.json / .sha256 files.
- Real DSH Desktop 0.2.2-rc.1 acceptance remains required for provider/model switching, background readability, chat failure feedback and the complete functional test guide.


## Chat recovery and guided feature navigation (dev.15)

### Implemented
- Client chat requests now carry a stable event ID. If the host committed a completed turn but the response was lost, retry reads the existing domain event and returns its saved reply without another LLM invocation or duplicate relationship-growth settlement.
- Reusing an event ID for different text, choice or event type is rejected with EVENT_ID_CONFLICT; the existing committed turn remains unchanged.
- Host error responses preserve safe provider/model metadata. The client retains error codes and presents actionable guidance for missing model configuration, provider failures, network errors, timeouts, host response errors and revision conflicts.
- A failed chat retains its text and exposes a dedicated retry action. Model setup failures can jump directly to Model Settings.
- The in-app functional guide now contains direct navigation actions for model settings, diagnostics, history, memories, relationship records, background settings, motion library and backup/restore.
- Changing a provider or model clears the previous connection-test result; saving a new selection also requires a fresh test.

### Verification
- Host regression verifies that replaying the same completed event returns the original reply, keeps the chat history at one user/assistant pair, and does not call the LLM a second time.
- Host regression verifies that reusing the event ID for different text returns HTTP 409 / EVENT_ID_CONFLICT.
- Client unit tests cover event ID shape and actionable error classification.
- Classic DSH client regression checks that retry controls and direct guide navigation remain in the built script.
- PR CI Run 43392486170 and push CI Run 43392443994: Node 24 and Node 24.9.0 both PASS; each reports 110 passed / 0 failed. PPL checks report 7 passed / 0 failed; npm package verification PASS.
- Windows Web/Desktop dev.15 artifact generated and verified: the archive contains the installable TGZ, its SHA-256 file and package-info.json; the TGZ digest, byte length and package version agree across all three.
- The existing private Google Drive file ID is retained and updated from the final PR CI artifact; a subsequent readback is byte-identical.
- DSH Desktop manual acceptance remains required for retry after simulated transport loss and each guide shortcut.


## P5-B：PPL 语言一致性、规范交付与执行审计（dev.16）

### B1 — PPL Core conformance
- CI builds the pinned `clonetimer/PPL` Core 0.3.0 compiler with TypeScript 5.8.3 pinned.
- Both Node 24 and Node 24.9.0 run the upstream Core conformance suite (`npm test`) and official reference-persona suite (`npm run test:refs`).
- The plugin's seven embedded DeepSeek Whale PPL source tests remain a separate persona-specific gate.

### B2 — frozen language reference
- Added pinned PPL 0.3 Stable semantics, EBNF grammar, Persona IR, Resolution, Runtime and Host Snapshot schemas under `docs/ppl-reference/`.
- `docs/ppl-reference/manifest.json` records the canonical upstream repository, commit, component version, runtime mirrors and reference-copy paths.

### B3 — source / IR / runtime parity
- Added `scripts/verify-ppl-integration.mjs` and `npm run verify:ppl -- .ppl-toolchain`.
- The verifier checks the pinned upstream commit and Core version, compiles `personas/deepseek-whale.ppl`, compares the serialized compiler output with the checked-in IR, and byte-compares vendored runtime/renderer/host-snapshot files and frozen reference copies with upstream.
- CI no longer silently overwrites the checked-in Persona IR. Stale IR is a deterministic build failure and must be regenerated from the pinned compiler in the same change as the source.

### B4 — execution audit and diagnostics
- Completed turns now persist a versioned `ppl.execution-audit/0.1` record containing persona/IR identity, host turn/step, snapshot hash, event classification, scene/context, active rules/transitions, effect trace, pending commits/transitions, invariant results, diagnostics, before/after runtime hashes and field-level state changes.
- The legacy `pplSnapshotHash` field now contains the actual host-snapshot hash for new events; `pplIrSha256` separately identifies the compiled IR. Historical events retain their original values.
- PPL resolution errors now expose `PPL_RESOLUTION_INVALID` and machine-readable diagnostics. Failed resolutions are recorded in the audit log without committing character state.
- Added `ppl-audit-history` API and a desktop audit viewer reachable from Diagnostics and Relationship History.
- Diagnostic plugin version now comes from package.json rather than a stale hard-coded version.

### Tests added
- Host integration checks a completed COMFORT turn records the expected active PPL rule, invariant result, snapshot/IR hashes and relationship state diff.
- PPL adapter tests verify invariant failures expose stable error codes and diagnostics.
- Service tests verify failed PPL resolution is audited without committing character state.
- SQLite tests verify failure audit redacts raw user message text and does not mutate character state.
- Client artifact tests verify the PPL audit viewer is included in the packaged classic client.


### dev.16 CI verification
- Node 24 and Node 24.9.0 CI matrix: PASS.
- PPL Core 0.3.0 conformance: 21/21 checks passed on each matrix leg.
- Upstream reference personas: all 3 compile and their 13 embedded source tests pass.
- DeepSeek Whale PPL source tests: 7/7 passed.
- Plugin suite: 113 passed / 0 failed on each matrix leg.
- PPL source/IR/runtime/reference parity verifier: PASS on both matrix legs.
- Windows Web/Desktop dev.16 installable archive, inner TGZ, package-info.json and SHA-256 manifest are generated and validated by CI.
- Private Google Drive dev.16 mirror is updated in place under the existing file ID.
- Desktop interaction audit display and controlled invariant-failure acceptance remain manual gates.

### Release gate
- Full Node 24 / Node 24.9.0 plugin test matrix.
- PPL Core conformance and official reference-persona suites on both matrix legs.
- PPL source/IR/runtime/reference parity verification.
- DSH Desktop manual acceptance of PPL audit display and a controlled resolution-failure scenario.


## P5-C1：PPL 可视化人格配置（dev.17）

### 已实现
- 新增版本化配置契约 `dsh-virtual-avatar.ppl-config/1`，仅开放经过筛选的 traits 与 style 数值，不开放规则、关系转换、invariants、identity 或 semantic bindings 的直接编辑。
- 温柔度下限为 0.60，与 `CORE_TONE` 不变量保持一致；其他开放参数限制在 0～1，统一按 0.01 步进归一化。
- 角色服务从不可变基础 Persona IR 派生配置 IR；不会覆盖 `personas/deepseek-whale.ppl` 或 `personas/deepseek-whale.pir.json`。
- 配置持久化在角色状态的 `pplConfigOverrides`，备份随角色状态保存；保存采用乐观 revision 检查。
- SQLite 在同一事务中保存角色配置并写入 `PPL_CONFIGURATION_UPDATED` 审计事件，记录参数变化、配置 schema 和 IR SHA-256。
- 新增预览场景：私密日常、安慰支持、赞美鼓励、公开场合；每个场景均执行真实 PPL Runtime 解析并检查不变量。
- 新增 Host API：`ppl-config-get`、`ppl-config-preview`、`ppl-config-set`、`ppl-config-reset`。
- 桌面端新增滑块、百分比读数、温柔陪伴/活泼元气/稳重克制预设、默认恢复、规则效果预览和保存应用入口。
- PPL 审计历史新增人格参数变更记录；角色关系、记忆、聊天记录、动作库与安全规则保持独立。
- 不带 Persona IR 的注入式测试/扩展 Runtime 保留原有行为，不强行替换其运行时适配器。

### 自动化验收
- PPL 配置 schema：仅允许白名单 traits/style 字段；拒绝未知字段、非有限数值、越界参数和不兼容 schema。
- 服务层：预览不写入角色状态；保存后运行时 IR 哈希变化；重启服务后配置恢复；默认恢复保留其他角色数据。
- 并发：使用 expectedRevision 拒绝过期配置写入。
- Host API：覆盖读取、预览、保存、恢复、审计和参数越界错误。
- 桌面端构建测试：检查 PPL 人格调校入口、预设、预览与保存操作进入 classic-script 交付包。

### 手动验收
- DSH Desktop 0.2.2-rc.1 安装 dev.17，按《功能使用与桌面验收指南》第 12 节完成滑块、预设、场景预览、保存、重启和恢复默认验收。
