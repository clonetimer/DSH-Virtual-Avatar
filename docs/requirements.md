# 产品需求规格（SRS）v0.1

状态：实施基线草案。用于约束 P1–P5，不代表所有功能已实现。

## 1. 产品定位

DSH Virtual Avatar 是一个面向 DeepSeek Harness Web/Desktop 的单插件产品，提供可配置的虚拟人格与多角色陪伴体验。它同时服务两个不同使用场景：
- **Agent Persona**：影响 DSH 主 Agent 的表达风格与人格约束，但不改变其工具权限、任务能力或事实责任。
- **Companion Character**：用于 Galgame/桌宠中的独立角色对话、关系成长和剧情，不默认接管主 Agent 身份。

## 2. 用户与使用场景

- 用户希望在不同工作区/会话中维持一致的主 Agent 人格。
- 用户希望在鲸鱼娘等多个角色之间切换，每个角色保留独立关系和记忆。
- 用户希望在 Galgame UI 中自由聊天、选择回复、查看历史、体验小剧场、CG 和桌宠。
- 用户希望人格能遵循明确规则，而不是完全依赖自然语言提示；PPL 提供规则解析和可审计快照。
- 用户已有 virtual-person、Whale 或 PPL 存档，希望迁移后不丢数据，并可恢复旧插件。

## 3. 功能需求

### FR-01 单插件安装
一个 DSH 插件包完成 Host、Client、设置页、Galgame 与桌宠注册。用户不需要分别安装 virtual-person 和 whale-galgame，也不需要常驻启动 PPL Gateway。

### FR-02 人格注册与切换
- 支持多个人格定义，每个有稳定 ID、名称、版本、用途、来源、启用状态。
- 支持 Agent Persona 与 Companion Character 两种用途。
- 支持新增、编辑、复制、导入、导出、启用、禁用、切换。
- 切换只影响后续请求，不改写历史对话。
- 角色 ID 和 persona ID 分离；多个角色可引用同一人格定义，但运行状态隔离。

### FR-03 单一提示词编排
- 只有一个模块负责主 Agent 全局人格注入。
- Companion Character 提示词只进入 Galgame 对话请求，不进入主 Agent 的普通工作请求。
- 禁止重复注入、隐式覆盖宿主 system prompt 或改变工具权限。
- 每次注入记录来源、persona 版本、PPL IR hash、状态 revision 和字符预算。
- PPL 失败时明确显示降级状态；不得把旧 snapshot 伪装成当前成功解析结果。

### FR-04 长期记忆
- 共享用户事实和角色私有记忆分开存储。
- 每个角色的私有记忆不得自动被其他角色读取。
- 兼容 virtual-person 的 pin、重复命中、相似合并、分层、预算和容量策略。
- 支持用户查看、编辑、置顶、取消置顶、删除和导出。
- 自动记忆只允许保存来自明确用户消息的有限摘要候选；重要事实需用户确认或显式 pin。
- 记忆来源、时间、更新时间、共享范围和处理记录可追溯。

### FR-05 角色关系与成长
- 保留 Whale 原有好感度/等级曲线、衰减、token 结算和防刷规则，除非单独评估并批准变更。
- 好感度、信任度、关系阶段、角色内部情绪/精力分别建模。
- UI 不得直接提交 trust/stage 数值；状态更新必须来自有稳定 event ID 的事件。
- 重复事件幂等；事件 payload 不一致但 event ID 相同必须报冲突。
- 中断/失败的对话不提交未完成的状态变更。

### FR-06 Galgame 与桌宠
- 保留 Whale 上游六个角色、立绘、背景、表情、Galgame 对话框、回复选项、历史记录、打字效果、键盘快捷键。
- 保留小剧场、工作复盘、CG 生成、CG 图鉴、桌宠动画和开关。
- 保留活动感知隐私边界：不读取工作区文件正文、不保存原始 Harness 文本。
- 联网取材可关闭；CG 使用本地密钥；不上传用户自定义立绘/背景。
- 上游现有功能和测试不得在整合中无理由删减。

### FR-07 数据迁移
- 支持 virtual-person 的 DSH_HOME/AGENT.md。
- 支持 Whale 的 DSH_HOME/storages/dsh-whale-galgame/global.json 及旧工作区存档标记。
- 支持 PPL Persona IR 与 Character session/state 的导入映射。
- 迁移先备份和 staging，预览后提交；支持重复运行、报告、回滚。
- 未知字段保留；迁移不得修改源文件。
- 迁移不自动将 Global Agent Persona 复制给六个角色。

### FR-08 诊断与可观测性
设置页展示插件版本、存储位置、当前 Agent Persona、Galgame 当前角色、PPL Runtime 状态、迁移状态、上次错误和数据备份状态。诊断导出不得包含 API key 或默认包含完整对话正文。

## 4. 非功能需求

- NFR-01 Node.js 最低版本按 22.19.0 设计。
- NFR-02 默认仅使用 DSH_HOME 本地存储；本地服务接口仅绑定 loopback。
- NFR-03 所有持久化写入原子化或事务化；损坏输入不得破坏现有存档。
- NFR-04 角色记忆与共享记忆隔离；导出/删除行为透明。
- NFR-05 旧插件可并行保留作回滚，但迁移期间禁止两个插件同时写同一存档。
- NFR-06 许可清单逐文件保留，尤其 Whale CC BY-NC-SA 4.0 美术。
- NFR-07 单元测试、契约测试、DSH Host 测试、Web/Desktop 实机验收分别报告，不相互替代。

## 5. 默认产品行为

- 首次安装不自动启用 Agent Persona 覆盖；用户主动选择。
- Galgame 默认当前角色为 Whale 原存档记录的角色；新安装默认鲸鱼娘。
- 角色记忆默认私有；共享事实只有用户明确授权才可共享。
- 迁移只预览不自动提交；必须由用户确认。
- 卸载不删除用户数据。
- PPL Runtime 不可用时，Galgame 可进入明确的兼容提示模式；关系事件不得静默写入 PPL 替代路径。

## 6. 验收场景

1. Agent Persona 关闭时，主 Agent prompt 与原 DSH 行为一致。
2. Agent Persona 开启时只注入一次；Galgame 角色提示不出现在普通 Agent 请求。
3. 切换 Galgame 角色后，聊天、关系、记忆互不串线。
4. 相同关系事件重放不重复增加 trust/好感；相同 ID 不同 payload 报冲突。
5. 导入 AGENT.md 后原文件 hash 不变，pin/hit/time/unknown sections 保留。
6. 导入 Whale global.json 后六角色关键字段、对话、CG、小剧场数量和媒体 hash 对账一致。
7. 迁移中断后可重试；相同源 hash 不产生重复数据。
8. 删除/卸载插件不删除存档；备份可恢复。
9. 外部取材关闭时不触发搜索；CG 不上传用户自定义图片。
10. Web/Desktop 各自完成真实安装、重启、对话、切换、存档重载验收。
