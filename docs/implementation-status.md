# DSH Virtual Avatar 实施状态（Companion-first）

更新基线：PR #1 开发分支 `feat/architecture-baseline`；本轮收敛分支 `feat/a1-control-char-regression`，对应 PR #3。

## 本轮验收结果

GitHub Actions run #211（最新已完成）：
- Node 22.19.0：PPL 编译、3 个 PPL 内置测试、项目检查与单元/集成测试步骤均通过。
- Node 24：上述步骤均通过。
- 自动化测试：27 passed / 0 failed。
- PPL Persona IR 0.3：编译器检查通过，0 errors / 0 warnings；3 个 persona source tests 通过。
- Whale 美术资源与上游 LICENSE / NOTICE / THIRD_PARTY_LICENSES：CI staging 步骤通过。

## 模块状态

| 模块 | 状态 | 证据 / 缺口 |
|---|---|---|
| DeepSeek Whale PPL persona | PASS | PPL 0.3 编译及 3 个内置测试 |
| PPL Runtime adapter | PASS（模块级） | completed / max-tokens 提交门禁；aborted 不提交 |
| Character service | PASS（模块级） | 角色对话准备、关系事件与持久化回归 |
| SQLite state / event ledger | PASS（模块级） | 重启恢复、乐观锁、事件幂等 |
| Memory service | PASS（模块级） | owner 隔离、相似合并、置顶、删除、预算 |
| Memory candidate workflow | PASS（模块级） | 自动只提出候选，需用户点击确认才写入 |
| Whale DeepSeek legacy import | PARTIAL | 保留完整原始 JSON，导入 DeepSeek 的关系/对话字段；图片 data URL 尚未提取成文件 |
| DSH host API | PASS（mock contract） | Host plugin integration test；Origin / Fetch Metadata 检查已接入；尚未在真实 DSH Web/Desktop 安装验收 |
| Web overlay UI | PASS（模块级） | 自由聊天、历史分页、记忆管理、摘要确认、角色设定、表情与白名单场景切换；真实 DSH Host 仍待实机验收 |
| Original Whale Galgame | DEFERRED / OUT OF SCOPE | 章节、分支、结局、游戏选项、小剧场与 CG 不属于当前产品范围 |
| Desktop pet | DEFERRED | 桌面动画生命周期作为后续独立评估项，不阻塞陪伴插件首发 |
| Settings / diagnostics | PARTIAL | API 具备 profile / memory endpoints，完整插件设置和诊断页未完成 |
| Backup / rollback | NOT YET | migration source 原文入库；尚无用户可见备份恢复与安全回滚流程 |
| Web/Desktop real-host qualification | NOT YET | 需要真实 DSH 目标环境 |

## 重要边界

- 首发仅启用 DeepSeek 鲸鱼娘。其余五位角色在迁移预览中明确标记为 deferred，不做隐式转换。
- 主 Agent 人格没有被此插件接管；陪伴提示仅用于本插件的独立 Companion Character 请求。
- 关系 trust / stage 由 PPL Runtime 决定；好感度/等级沿用 Whale 游戏进度模型，两个状态域不混用。
- 记忆候选不会自动写入。只有用户明确确认后才保存。
- CI 通过不能替代真实 DSH Web/Desktop 安装、模型供应商调用、跨会话存档和 UI 交互验收。

## 下一轮工作（连续执行）

1. 完成 Whale 原存档中 DeepSeek 角色媒体 data URL 的受控提取、hash 对账和备份恢复。
2. 建立迁移回滚的事务/冲突保护，防止覆盖迁移后产生的新聊天或关系状态。
3. 完成迁移备份、冲突保护与可恢复回滚，避免覆盖迁移后新增状态。
4. 完成记忆查看/编辑/删除/导出和隐私说明的 UI 体验收敛。
5. 增加设置/诊断页面，展示 PPL、存储、模型调用和最近错误状态。
6. 完成 DSH Web 与 Desktop 实机安装、真实模型流式调用和跨会话重载验收，再判断是否进入发布阶段。

## 最新增量（PR #1 后续提交）

- 历史版本曾实现上下文驱动的三选项生成；按 Companion-first 决策，当前已从陪伴主流程移除，不再作为首发能力。
- 旧选项生成回归仅保留在历史记录中，不作为当前产品验收项。
- README 增加 DSH 插件包结构与本地开发接入说明：Cordis Host entry、bundle patch、Web Client injection 与 API 前缀。
- 仍未宣称真实 DSH 插件安装通过；插件管理器目录和具体安装方式需按目标 DSH 发行版实测。


## 安全与选项生成回归增量

- 修复模型生成选项的 JSON 数组提取正则；测试现在断言实际生成的三条选项文本，而非仅检查回退选项 effect。
- DSH Host handler 已调用 same-origin / Fetch Metadata 校验；跨站和错误 Origin 测试覆盖。
- UI 展示最近一条角色回复对应的表情资源，并使用白名单背景资源。
- GitHub Actions run #211：Node 22.19 / 24 均通过，27 tests passed / 0 failed。


## 场景切换增量

- 增加 `background-set` API，仅允许两个内置背景 ID；拒绝路径穿越及未知资源名。
- Web 面板增加“切换场景”操作，切换结果持久化到角色状态，并在重新打开/刷新后继续使用。
- Host 集成测试覆盖有效场景切换和非法背景拒绝。
- 最近一次完整 CI Run #215 在本次场景切换改动前通过（Node 22.19 / 24）；本次新增代码需等待新的 CI 运行结果。


## 2026-11-11 后续增量

- Run #215：在场景切换 API/UI 增量之前，Node 22.19 与 Node 24 均通过。
- 新增 `background-set` API 与界面场景切换，场景 ID 采用白名单校验并写入 SQLite。
- 将浮动入口从临时圆形鲸鱼按钮替换为 DeepSeek 鲸鱼娘实际立绘资源（默认 maid-left.webp），保留按钮式打开交互。
- 增加 Host API 资源引用测试，检查默认立绘和背景资源路径。
- 当前提交尚未获得新的 CI 结果；不能把 Run #215 作为本次新增代码的验收证据。
- 原版 Whale 桌宠 spritesheet 使用 192×208 单帧、8 列及 idle/running/waiting/look 相关帧；当前仓库的资产 staging 只包含独立表情/背景 WebP，尚未接入 spritesheet，因此本轮没有虚称完成原版动画桌宠。

## 单角色 MVP 剩余关键项

1. DSH Web/Desktop 实机安装及真实模型流式调用。
2. 原版 Whale spritesheet 的许可/素材 staging 与桌宠动画生命周期。
3. 原版 Galgame 全屏 VN 交互：逐句显示、历史回看、选择分支与背景/角色状态。
4. CG 图鉴、小剧场及其数据模型。
5. 旧存档内嵌图片提取、文件 hash 对账、备份/恢复与迁移回滚。
6. 完整包构建与安装/升级/卸载回归。


## 对话体验优先增量

- 角色服务不再截断持久化对话记录；完整历史保存在角色状态中。
- 新增 `history` 分页 API，支持 limit / before 游标，按时间顺序返回历史片段。
- Web 对话界面增加“查看更早的对话”入口，按需加载历史，避免初始视图一次渲染过长记录。
- 增加历史分页 API 的集成测试，验证总量、游标和记录顺序。
- 注意：模型单轮上下文仍使用最近 12 条消息，长期连续性由角色记忆和历史记录共同支持；下一步需增加显式剧情摘要，而不是把全部历史无限塞入模型上下文。


## 2026-11-11：对话连续性与剧情记忆增量

### 已实现
- 新增结构化 Story Memory：剧情摘要、用户确认事实、关键事件、未完成剧情线程。
- 关键事实必须提供稳定 ID 与 sourceEventId；重复确认幂等，ID 复用但内容变化时报冲突。
- 用户完成 Galgame 选择后，选择事件写入关键事件列表；中断/失败回合不会进入该路径。
- 下一轮鲸鱼娘 Prompt 会注入已保存剧情摘要、已确认事实和近期关键事件。
- 新增剧情记忆查询、事实确认、摘要更新 API；摘要支持 revision 乐观锁。
- Web 面板增加“剧情记忆”入口，用户可以查看并明确确认长期事实。
- 增加 story-memory 单元测试、角色服务连续性测试和 Host API 集成测试。

### 设计边界
- 自动生成的剧情摘要不能直接覆盖已确认事实。
- 事实必须经过用户确认；关键选择事件由系统记录来源 eventId。
- 目前未完成剧情线程的 UI 编辑和模型辅助摘要审阅工作流。
- Story Memory 与普通 Character Memory 分开，避免相似文本合并破坏剧情语义。

### 本轮待验收
- 该阶段的测试结果属于历史提交，不代表当前 head 的验收状态。


## 产品方向调整：对话、记忆与陪伴（停止 Galgame 剧情）

用户已明确决定：不再开发 Galgame 章节、剧情分支、剧情结局和游戏式选项；首发角色聚焦自由对话、长期记忆、关系养成和日常陪伴。

### A1 已实现的代码增量
- 上下文窗口改为按预算选择最近消息，并优先保留长期相处摘要与相关记忆。
- 记忆检索按置顶、文本相关度和最近访问排序；角色记忆仍严格按 owner 隔离。
- 新增长期相处摘要候选生成：结合近期对话、已确认事实、共同经历和普通长期记忆；只生成候选，不自动覆盖。
- 摘要候选带 sourceHash 和 expectedRevision；用户确认时使用乐观锁，避免覆盖并发更新。
- DSH 对话请求现在使用 context-window 选择出的消息，不再在 Host 层自行截取最近 12 条。
- 对话界面移除游戏式三选项，恢复自由输入聊天；加入“整理记忆”入口供用户预览并确认摘要。
- 移除主流程中的 Galgame story-run / story-choice API；保留共同经历、确认事实等连续性数据作为陪伴记忆。
- 修复长期相处记忆的控制字符清理和换行格式。

### A1 验收边界
- 摘要为确定性抽取式候选，不是模型自动事实判断；用户确认后才持久化。
- 相关度检索目前采用本地文本相似度排序，不宣称语义向量检索。
- 需要当前 head 的 Node 22.19 / 24 CI 通过后，才能标记 A1 模块级验收。
- 真实 DSH Web/Desktop 对话与跨会话验收仍未完成。

## 2026-11-11：A1 / P1 Companion-first 收敛验收

### 已完成
- 修复 \`memory-summary.mjs\` 中 C0/C1 控制字符清理正则的重复转义，并增加回归测试。
- 退役不再被产品使用的 Galgame story-engine 及其独立分支测试；保留共同经历、确认事实和长期相处摘要作为陪伴连续性记忆。
- 将 PPL 人格约束中的 Galgame 场景描述改为独立陪伴对话场景，并由 CI 使用固定 PPL Core 重新生成 PIR。
- 修正旧测试对 Host API、事实提示标题和摘要标题的过期假设。
- 将每日正向成长上限接入实际角色好感度结算；不再只更新旁路 growth 统计。
- 关系事件来源统一为 \`companion\`；否定表达与无关的“喜欢”语句不再误触发正向好感。
- README、SRS、上游功能基线和测试计划统一到 Companion-first 范围。

### 验收证据
- GitHub Actions Run #341：Node 22.19.0 与 Node 24 均通过。
- GitHub Actions Run #344：Node 22.19.0 与 Node 24 均通过；Node 24 测试为 42 passed / 0 failed。
- PPL Persona 0.3：编译检查 0 errors / 0 warnings；生成 IR 与当前 PPL source 一致。
- 以上是 CI 与模块级证据，不等同于真实 DSH Web/Desktop 实机验收。

### 当前剩余工作
1. DSH Web/Desktop 真实宿主安装、DeepSeek 流式调用、刷新与跨会话持久化验收。
2. Whale 旧存档 DeepSeek 媒体提取、源 hash 对账、备份和迁移回滚。
3. 记忆管理 UI 的可理解性、长期摘要确认冲突提示和数据导出/删除体验。
4. 设置/诊断界面与干净安装、升级、卸载回归。
