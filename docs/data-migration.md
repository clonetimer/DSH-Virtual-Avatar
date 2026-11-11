# 数据模型与迁移策略（Companion-first）

## 1. 数据域

| 数据域 | 所有者 | 说明 |
|---|---|---|
| Companion Persona | PPL Runtime | 鲸鱼娘人格定义、IR 版本与来源 |
| Character Memory | Memory Service | 鲸鱼娘私有长期记忆、确认事实与相处摘要 |
| Affection Progress | Companion Domain | 好感度、等级、每日成长计数 |
| Relationship State | PPL Runtime | trust、attachment、stage 与人格状态 |
| Conversation History | Companion Domain | 自由对话历史与来源事件 |
| Companion Continuity | Companion Domain | 用户确认事实、共同经历、长期相处摘要 |
| Media Assets | Asset Store | 角色立绘、用户上传素材及迁移媒体 |
| Audit / Migration | Platform | 原始来源、迁移报告、哈希、schema 版本 |

## 2. 存储边界

- character_states 保存角色当前关系、成长、对话和连续性状态。
- memory_items 按 owner 隔离，首发只启用 character/deepseek。
- media_assets 保存提取后的媒体元数据；实际文件位于 DSH_HOME 下的 storages/dsh-virtual-avatar/assets/。
- migration_sources 保留原始来源文本与 source SHA-256；解析后的摘要不重复保存完整媒体 payload。
- 所有用户数据均保存在本机 DSH_HOME，不随插件包发布。

## 3. virtual-person 导入

源文件：DSH_HOME/AGENT.md。

- 保留原始 Markdown 完整副本和 SHA-256。
- 解析角色设定正文与“## 记忆”分节；未知标题、自定义段落和旧版 Weight 格式保留为待处理内容。
- 保留时间戳、命中次数、pin 标记、原始行顺序和原始文本。
- 不把全局 Agent Persona 自动复制给鲸鱼娘，也不接管主 Agent。
- 导入预览不写数据；必须由用户明确确认后提交。

## 4. Whale 旧存档导入

源文件：DSH_HOME/storages/dsh-whale-galgame/global.json。

首发仅导入 characters.deepseek。其他角色的状态与媒体均标记为 deferred；完整原始 JSON 仍保留在迁移来源归档中。

- 保留 DeepSeek 等级、好感度、自由对话历史、角色设定、CG 引用和自定义立绘元数据。
- 保留选定的全局背景/CG 引用；不把其他角色的媒体混入 DeepSeek 资产目录。
- 未知字段继续保存在 DeepSeek 扩展状态或原始来源归档中。
- 只转换媒体字段中的 data URL；普通文本、时间戳和对象结构不做无关重写。

### 媒体提取规则

1. 仅提取 DeepSeek 角色字段及明确引用的全局 bg / cg。
2. 支持 PNG、JPEG、WebP、GIF、AVIF；拒绝 SVG、未知 MIME 和非规范 Base64。
3. 单个媒体文件上限为 12 MiB，单次 DeepSeek 媒体导入总量上限为 64 MiB；超限时整个迁移事务失败，不留下半成品状态。
4. 以媒体内容 SHA-256 生成内容寻址文件名；asset ID 同时绑定 MIME，避免相同字节被不同 MIME 误解释。
5. 文件先写入同目录临时文件，再原子重命名；SQLite 记录与角色状态在同一事务内提交。
6. 角色状态中的 data URL 替换为 asset://dsh-virtual-avatar/<asset-id> 引用；原始 data URL 只保留在只读来源归档。
7. 读取媒体时重新计算 SHA-256 和字节数；不匹配或文件缺失时明确报错，不静默使用损坏素材。
8. SQLite 事务失败时删除本次刚创建的媒体文件；不会删除迁移前已有资产。

## 5. PPL 导入与状态映射

- Persona IR 保存 persona id、version 与 IR hash；不把 computed trait 当作 durable user memory。
- Host Snapshot 作为可审计的解析证据，按保留策略保存，不保存完整 transcript。
- PPL 关系状态只通过已完成互动事件更新；不能用伪造事件重放旧关系值。
- 不兼容状态采用显式 conflict report，用户确认后再迁移。

## 6. 幂等、备份与回滚

当前实现：
- 计算来源 SHA-256 并归档完整原始来源。
- 预览阶段只读；相同来源哈希重复提交不会重复导入。
- DeepSeek 状态、媒体元数据和来源记录在 SQLite 事务内提交。
- 文件写入采用临时文件与原子重命名；数据库失败时清理本轮新增文件。

当前已具备受限回滚：
- 迁移提交时记录角色迁移前状态版本、迁移后 revision，以及本次新建的媒体资产 ID。
- 回滚前先检查角色 revision；若迁移后发生任何状态写入，则拒绝回滚，不覆盖新聊天、关系或记忆。
- 用户显式确认后，在事务中恢复迁移前状态、移除本次迁移独占创建的媒体资产记录，并标记迁移已回滚。
- 事务提交后清理本次新增的媒体文件；已存在/复用的媒体资产不删除。
- 回滚只允许执行一次，原始来源归档继续保留。

尚待实现：
- 数据库完整快照与用户可见备份/恢复入口。
- 面向 UI 的迁移预览、回滚向导和可下载审计报告。

## 7. 隐私

- 记忆来源和共享范围必须可见。
- 删除记忆时同步删除其派生索引/缓存；审计只保留必要删除事件，不保留已删除正文。
- 不将 Harness 文件内容、工具参数或工具输出自动迁入记忆。
- 外部模型调用使用当前选定 DSH provider；API key 不进入存档或仓库。
