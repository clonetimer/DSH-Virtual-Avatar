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
