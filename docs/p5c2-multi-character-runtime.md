# P5-C2 多角色 PPL 运行时：架构、契约与验收

## 目标与适用范围

P5-C2 在保留鲸鱼娘原有桌宠/游戏体验的前提下，增加真实的第二个 PPL Persona 和角色中心。它不把仅能注册 IR 的 Registry 当作完整多角色系统，而是提供对话、状态、记忆、模型、配置和审计的分角色调用链。

本批提供两个固定、来源明确的角色：

| stable character ID | Persona IR | 客户端展示 | 画面 |
|---|---|---|---|
| `deepseek` | `DEEPSEEK_WHALE` | 鲸鱼娘 | 保留原桌宠立绘、背景、动作包 |
| `ppl-zhuang-fangyi` | `ZHUANG_FANGYI` | 庄方宜 · PPL 参考角色 | 独立 Q 版 SVG 概念立绘；尚无专属表情/动作包 |

第二角色从固定的 `clonetimer/PPL` 上游提交中引入，源文件与 DH adapter 参考 IR 分别来自上游不同目录。两者均保留准确来源与逐字节核验。参考 IR 不是现编译示例源文件的逐字节等价产物；以已发布参考 IR 为运行依据，CI 会报告差异而不自动篡改。

## 角色请求的稳定身份

角色选择用 SQLite `companion_selection` 单例记录，用户下次启动恢复最近选择。**每个实际读写请求仍携带明确 `characterId`**，不能从全局选择推断目标角色：这样一个窗口切换角色不会把另一个窗口已发出的消息提交到错误角色。

- 内置鲸鱼娘继续沿用旧 API，例如 `chat`、`view`、`memory-list`，其数据仍位于原来的 `deepseek` 存储键。
- 第二角色统一使用 `character-*` API，并强制 `characterId = ppl-zhuang-fangyi`。
- 对未注册角色、企图把鲸鱼娘传入泛型接口、跨角色记忆 ID、跨角色复用事件 ID 进行拒绝。
- 幂等提交按 `eventId + characterId + eventType + payloadHash` 验证，不允许只凭事件 ID 与载荷相同就跨角色复用。

## Host API

| 接口 | 说明 |
|---|---|
| `character-list` | 返回已注册角色及持久化选中角色 |
| `character-select` | 验证并更新最近使用角色 |
| `character-view` / `character-history` | 当前角色视图与历史记录 |
| `character-chat` | 当前 Persona IR 的独立对话和 PPL 事务提交 |
| `character-scene-set` | 切换该 Persona IR 支持的真实场景 |
| `character-model-catalog/set/clear/test` | 按角色选择和测试模型，不更改主 Agent 或其他角色的选择 |
| `character-memory-list/add/edit/pin/delete` | 只读写当前角色私有记忆 |
| `character-config-get/preview/set/reset` | 独立 PPL 参数管理、四场景语义预览与保存 |
| `character-audit-history` | 只查询该角色的提交与配置审计 |

每个 `character-*` 接口（除角色列表、选择接口外）必须明确传入 `characterId`。所有 API 经原有 DSH Host Origin 校验，并通过参数化存储接口访问 SQLite。

## SQLite 与状态边界

- `character_states.character_id`：不同角色独立的聊天记录、关系、PPL 状态、会话编号和人格参数。
- `memory_items.owner_kind='character', owner_id=characterId`：角色专有记忆，不混用共享事实库。
- `chat_model_selections.character_id`：角色专属模型。
- `audit_events.aggregate_id=characterId`：角色配置、事务及模型变更审计。
- `companion_selection`：用户最近选择的角色；仅作为 UI 偏好，不作为任何写操作的身份依据。
- 备份保留完整 SQLite 数据库，不只保存当前选择的角色。
- 旧角色键 `deepseek` 保持不变，不执行批量重写迁移。

## Generic PPL Companion 生命周期

1. Registry 查询经过验证的 Persona IR，创建角色专属 Runtime。
2. 每次请求从当前 `characterId` 的存储记录恢复专属 runtime state、关系和对话上下文。
3. 只检索 `ownerId=characterId` 的记忆；PPL Runtime 根据自身 IR、当前场景和事件执行规则。
4. 使用该角色的 static/dynamic PPL prompt 生成 LLM 输入；禁止注入鲸鱼娘的固定身份和剧情提示。
5. LLM 成功完成后，以 expectedRevision 提交 `TURN_COMPLETED` 和 PPL 状态；传输或模型异常不提交。
6. 若客户端丢失响应，可复用相同角色、相同事件 ID 和文本找回原回复；不会重复调用模型或跨角色重放。

Generic PPL 参考角色不沿用鲸鱼娘的 Galgame 好感度等级、赠礼或美术动作，这些机制仍由鲸鱼娘专用服务负责。

## Persona 配置保护

配置根据真实 IR 的 Float01 语义字段建立白名单。所有值限制在 0–1，并经真实 Runtime 校验；参考角色 `CORE_DIGNITY` 要求正式程度在亲密场景中依然达标，因此配置下限设为 0.65。保存前验证私密、公开、安慰、亲密关系四种场景。PPL 规则、转换条件、不变量及编译源文件不可通过 UI 编辑。

保存采用乐观 revision，配置变更与审计写入同一 SQLite 事务。恢复默认清除当前角色的覆盖层，不改变其他角色的配置、关系、聊天或记忆。

## 产品限制与后续方向

- 当前两个角色是固定、受检的内置角色；尚未开放用户在 UI 中上传任意 Persona IR 进行安装。
- 第二角色当前有独立 Q 版概念立绘，但还没有专属表情、动作帧或 Galgame 资源；这些功能不会借用鲸鱼娘动画。
- 泛型 PPL 角色未复刻鲸鱼娘特有的好感度游戏、CG 与小剧场系统，避免错误赋予其他角色这些能力。
- 角色切换与双窗口隔离必须通过 DSH Desktop 0.2.2-rc.1 实机验收；自动化测试 PASS 不能代替桌面验收。
- 后续可在具备原生 Persona IR、素材授权和测试覆盖后增加更多正式角色，并逐步扩展角色的产品能力。


## dev.19 模型调用契约与角色立绘补全

- DSH LLM 消息类型严格区分临时 `RequestUserInput` 与持久 `Message`。用户请求输入不带 id/source；历史 assistant 必须带唯一 id 与 `source.kind='model'`。
- 每轮历史保存实际模型来源，避免后续请求用错误 provider/model 标注 assistant 消息。
- 模型设置先读取已启用 provider/model 目录；空目录和目录错误有明确界面状态。手动模型 ID 仍须经过真实连接测试。
- 连接测试直接测试未保存的 provider/model 草稿；成功后才可保存。瞬时传输错误最多重试一次。
- 庄方宜独立 SVG 立绘路径：`assets/characters/zhuang-fangyi/portrait.svg`，由 Host 精确白名单提供。
