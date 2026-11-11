# 实施路线与验收门槛

## 原则

按真实可交付能力推进，不用“接口已建”替代功能完成。每阶段先做 feature branch、测试、证据和审查，再合并 main 并打阶段标签。未通过的阶段保留在候选分支，不破坏可用基线。

## P0 — 源码与功能基线冻结

**目标：** 明确三方上游版本、能力、数据格式、许可、运行环境与可复用接口。

工作项：
- virtual-person 0.7.2：核对 AGENT.md 注入、记忆合并/置顶/淘汰、设置页、API、测试。
- whale-galgame 0.7.0：核对六角色、全局存档、Galgame、活动感知、小剧场、CG、桌宠、隐私、素材许可。
- PPL：冻结 Core 0.3 / Runtime 0.1 参考版本；核对 Adapter、Character Governance dev.5、Gateway 和测试。
- 建立逐项 feature provenance 与 license inventory。
- 定义 Node / DSH Web / Desktop 目标兼容矩阵。

验收：所有保留功能均有来源、实现位置、迁移策略、测试方式；不清楚的能力标为 TBD，不推断已实现。

## P1 — 统一数据模型与迁移原型

**目标：** 不改动旧数据，完成只读解析、预览、备份和可重复导入原型。

工作项：
- 设计稳定 ID、版本字段、schema migration 和 event idempotency。
- 解析 virtual-person AGENT.md：区分 persona body、记忆分节、记忆行元数据和未知自定义内容。
- 解析 Whale global.json：保留角色设定、等级/好感、聊天记录、选择项、活动记忆、CG、小剧场、偏好。
- 设计 PPL Persona IR / Character session 与新角色 ID 的映射。
- 输出迁移报告：成功/跳过/冲突/需人工处理条目及哈希。
- 原始文件备份可恢复；相同源文件重复导入不得重复记忆或事件。

验收：fixture 覆盖真实格式、边界/损坏输入、重复迁移、回滚；旧文件逐字节保持不变。

## P2 — 插件骨架与统一人格注入

**目标：** 单插件可安装，只有一个提示词编排器。

工作项：
- DSH Host plugin + Client UI entrypoints。
- Persona Registry：创建/编辑/启用/禁用/切换/版本。
- PPL Runtime adapter：动态选择 Persona IR，生成 static/dynamic prompt 与 Snapshot。
- Agent persona 与 Galgame persona 分开绑定。
- 注入去重、prompt budget、compaction 后恢复、错误降级。
- 设置页展示当前生效 persona、来源、版本和诊断。

验收：同一请求只注入一次；切换角色不污染其他会话；PPL 不可用时有明确降级；Web/Desktop 契约测试通过。

## P3 — 记忆与关系状态

**目标：** 迁移并统一长期记忆和角色关系治理。

工作项：
- Shared User Facts 与每角色私有记忆。
- virtual-person 的相似合并、pin、分层、预算和容量策略适配。
- Whale 的每角色记忆读写、消费与历史连续性。
- Character Governance adapter：关系事件、trust/stage/privateMode、幂等和审计。
- Affection / Level 继续由 Whale 游戏规则管理；定义其与 PPL 关系状态之间的事件映射，不做字段混同。
- 用户可查看、修改、删除和导出记忆/状态。

验收：角色记忆不串线；重复事件只结算一次；失败/中断不提交未完成状态；SQLite 重启恢复；旧好感与关系数据无损迁移。

## P4 — Galgame 与桌宠整合

**目标：** 恢复完整 Whale 用户体验并接入新 Registry/Memory/Relationship。

工作项：
- 保留六角色立绘、背景、表情、对话、回复选项。
- 保留小剧场、工作复盘、CG 生成和图鉴。
- 保留桌宠动画、点击进入、显示/隐藏与跨 Web/Desktop 状态。
- 任务事件只使用显式用户消息的确定性分类；活动队列按角色去重。
- 将旧角色状态迁移到新领域服务，UI 只通过应用服务读写。

验收：上游现有测试全量保留并通过；关键用户路径端到端通过；CG/联网取材的 opt-out 和隐私约束通过。

## P5 — 产品化与发布

**目标：** 一个包完成安装、配置、更新、卸载和数据迁移。

工作项：
- 单插件 manifest / bundle / settings / client。
- 一键迁移向导、备份恢复、诊断导出。
- Web 与 Desktop 目标环境资格验证。
- 包体积、启动耗时、存档增长和模型上下文开销评估。
- 安全/隐私/第三方许可审计。
- 安装升级/回滚/卸载测试；卸载默认不删除用户数据。

验收：单插件干净环境安装成功；旧版数据迁移成功；升级/回滚可恢复；无重复注入、无丢失关系/记忆/媒体；文档可由非开发用户独立完成安装与恢复。

## 发布门槛

- P0 PASS 后冻结功能与许可基线。
- P1 PASS 后才允许真实用户数据写入新存储。
- P2 PASS 后才允许替代旧人格注入插件。
- P3 PASS 后才允许切换关系/记忆写入主路径。
- P4 PASS 后才允许替代 Whale 插件。
- P5 PASS 后才可标记 Stable。

任何阶段不能以 mock/fixture 结果冒充真实 DSH Host 验收。
