# 架构决策与模块边界

## 1. 目标形态

单一 DSH 插件包、单一安装/升级/卸载入口；内部采用模块化单体，避免首版引入必须常驻的外部 PPL 服务。Web 与 Desktop 共用同一 Host 核心和持久化格式，UI 按 DSH profile 能力挂载。

```text
DSH Virtual Avatar (one plugin)
├─ Host Adapter / Prompt Orchestrator
├─ Persona Registry
│  ├─ Persona Document Adapter (virtual-person Markdown)
│  └─ PPL Persona IR / Runtime Adapter
├─ Memory Service
│  ├─ Shared User Facts
│  └─ Per-character Memory
├─ Character Domain
│  ├─ Affection / Level Progression
│  └─ PPL Character Governance Adapter
├─ Galgame Domain (chat / side stories / CG)
├─ Desktop Pet
├─ Activity Context (explicit user events only)
├─ Storage / Migration / Audit
└─ Client UI (settings + Galgame + pet)
```

## 2. 模块职责

### Host Adapter / Prompt Orchestrator
- 是唯一拥有全局人格注入权的模块。
- 每轮生成一个确定性 Prompt Assembly：DSH base instructions、当前 Agent persona（可选）、当前 Galgame character persona（仅 Galgame 请求）、角色状态摘要、授权记忆、有限活动提示。
- 普通 Agent 人格与 Galgame 陪伴角色默认隔离。用户显式启用联动后才允许共享选定的人格事实；切换桌宠角色不得暗中改变主 Agent 身份。
- 对注入来源、版本、字符预算和冲突进行诊断；同一请求不得重复注入同一 snapshot。

### Persona Registry
- 每个 persona 有稳定 id、版本、显示名、提示/IR、场景、模型偏好和启用范围。
- 支持全局 Agent persona、Galgame character persona 两种用途；同一个 persona 可被两个用途引用，但运行状态与上下文不自动共享。
- PPL Runtime 是结构化人格规则的首选执行器；Markdown 是兼容导入/编辑格式。不能把 Markdown 文档未经校验直接声称为 PPL IR。
- 角色切换只改变后续请求，必须保留当前会话历史并记录切换事件。

### Memory Service
- Shared User Facts 与 Character Private Memory 分区。
- virtual-person 的 Markdown 记忆规则作为导入/兼容适配：相似合并、命中次数、pin、分层、预算选择和容量淘汰。
- Whale 的 per-character memory 保持角色隔离；迁移时保留原始内容、时间和来源。
- 记忆写入必须可追溯到明确用户消息、用户确认或可审计的模型候选；模型自动总结不能直接覆盖高优先级事实。
- 提供用户查看、编辑、置顶、删除和导出入口；不能以“模型会记住”为由隐藏持久化数据。

### Character Domain
- Affection / Level 是游戏成长机制，不等价于 Trust。
- Trust、relationship stage、private mode、角色内部状态分别定义 schema、边界与更新事件。
- PPL Character Governance 负责确定性关系规则、幂等和审计；游戏好感度曲线保留 Whale 原有语义，除非单独经过公平性测试与用户确认。
- 模型只能提出候选事件，不可直接提交任意状态数值。

### Galgame / Pet / Activity
- 优先保留 Whale 的对话 UI、小剧场、CG 图鉴、桌宠动画与快捷键。
- Activity Context 仅使用明确用户消息及允许的工具名/状态元数据；不读取工作区文件正文、不保存原始任务文本。
- 严肃/敏感活动不得自动改编成喜剧小剧场；保留现有题材拦截与本地取材开关。
- CG 外部服务请求继续使用用户本机密钥；不得把密钥写入存档或仓库。

## 3. PPL 接入决策

首版采用进程内适配，不要求用户先安装/启动 PPL Gateway：
- 复用 PPL Core 0.3 Persona IR 与 Runtime 0.1 已冻结的公开契约。
- 对 PPL Character Governance dev 产品代码建立独立版本/提交锁定和资格测试；不能把 dev.5 描述为 Stable。
- 先实现 Character Governance adapter interface，测试可使用 fake service；通过依赖打包与许可审查后再嵌入/发布所需 PPL 包。
- PPL DSH Adapter 当前固定加载单个 Persona IR，不能直接当作多角色 Registry。需要从其 Runtime/Host Snapshot 契约提取可复用部分，重新实现多 Persona selection 与单一 prompt orchestration。
- 禁止同时启用 PPL 原独立全局注入插件与本插件注入器。

若进程内发布包的依赖/许可/兼容性暂时不满足，可短期提供 loopback Gateway adapter 作为可选开发模式；正式默认不得依赖外部守护进程。

## 4. 持久化边界

首版采用单一产品存储根目录，SQLite 管理结构化状态和事件，文件目录保存媒体资源；所有写入原子化。迁移前备份 Whale JSON 和 virtual-person AGENT.md。不得让旧插件与新插件并发写入同一数据源。

逻辑命名空间：
- personas / persona_versions
- memory_items / memory_events
- character_profiles / relationship_states
- affection_progress
- conversation_refs / side_stories
- activity_events / consumed_activity
- migration_runs / audit_events
- media_assets

对话正文与媒体是否迁入数据库需先检查上游现有存储体积和数据格式；不因统一架构而强制搬迁所有二进制媒体。

## 5. 安全与隐私

- 默认本地存储，外部模型/CG/搜索发送内容在设置中清晰说明。
- 原始 Harness 工作区文本不进入长期记忆，除非用户明确执行记忆操作。
- PPL Snapshot 和审计记录仅保存必要的结构化状态与来源摘要，不复制完整 transcript。
- 所有 API 仅绑定 loopback；若 DSH Web Server 的安全模型要求 CSRF/origin 检查，沿用宿主策略。
- 文件写入路径必须固定在 DSH_HOME 受控目录；拒绝任意路径穿越。
- 导入、清理、迁移和删除操作提供预览与明确确认。

## 6. 关键架构决策

| 决策 | 结论 |
|---|---|
| 插件形态 | 单一 DSH 插件包 |
| 内部结构 | 模块化单体 |
| 全局人格注入 | 唯一 Orchestrator |
| 人格规则 | PPL Core/Runtime 适配 |
| 关系治理 | PPL Character Vertical 适配，资格验证后启用 |
| 好感度 | 保留 Whale 独立成长模型 |
| 记忆 | Shared Facts + Per-character Memory |
| 存储 | 本地 SQLite + 媒体文件 |
| 迁移 | 只读盘点、备份、导入、校验、切换 |
| 降级 | PPL 不可用时显式降级，不丢状态、不重复事件 |
