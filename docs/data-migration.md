# 数据模型与迁移策略

## 1. 数据域

| 数据域 | 所有者 | 说明 |
|---|---|---|
| Persona Definition | Persona Registry | Markdown 原文、PPL IR、版本与来源 |
| Shared User Facts | Memory Service | 用户明确授权跨角色共享的事实 |
| Character Memory | Memory Service | 每个角色独立的长期记忆 |
| Affection Progress | Galgame Domain | 等级、好感、升级记录与余额 |
| Relationship State | PPL Character Adapter | trust、stage、privateMode 等规则状态 |
| Conversation History | Galgame Domain / DSH | 对话与选项历史，按来源策略迁移 |
| Activity Events | Activity Context | 固定分类、状态、匿名指纹与消费标记 |
| Story / CG | Galgame Domain | 小剧场记录、生成提示、媒体引用 |
| Media Assets | Asset Store | 内置素材、用户上传素材、生成 CG |
| Audit / Migration | Platform | 迁移报告、事件来源、schema 版本 |

## 2. 建议结构（逻辑 schema）

- `persona_definitions(id, kind, version, source_format, source_hash, content, enabled, created_at, updated_at)`
- `persona_bindings(scope, scope_id, persona_id, priority)`
- `memory_items(id, owner_kind, owner_id, text, level, pinned, hit_count, source, source_hash, created_at, last_seen_at)`
- `memory_events(id, memory_id, event_type, source_event_id, payload_hash, created_at)`
- `character_profiles(character_id, persona_id, display_config, asset_refs, schema_version)`
- `affection_progress(character_id, level, affection, token_balance, last_activity_at, updated_at)`
- `relationship_states(character_id, state_json, revision, updated_at)`
- `domain_events(event_id, character_id, event_type, payload_hash, source, occurred_at, applied_at)`
- `conversation_refs(id, character_id, source_workspace, source_session, payload_ref, created_at)`
- `activity_events(fingerprint, category, status, occurred_at, source_session)`
- `story_records(id, cast_json, transcript_json, source_refs_json, created_at)`
- `media_assets(id, kind, path, mime_type, sha256, license_ref, created_at)`
- `migration_runs(id, source_kind, source_path, source_hash, target_version, status, report_json, created_at)`
- `audit_events(id, aggregate_kind, aggregate_id, event_type, source_event_id, before_hash, after_hash, created_at)`

该 schema 是设计基线，P1 实施前仍需根据真实上游数据和 SQLite 访问模式评审，不代表数据库已经创建。

## 3. virtual-person 导入

源文件：`<DSH_HOME>/AGENT.md`。

导入要求：
- 保留原始 Markdown 完整副本和 SHA-256。
- 解析角色设定正文与 `## 记忆` 分节；未知标题、自定义段落、旧版 Weight 格式均保留为原始字段或待处理条目。
- 保留时间戳、命中次数、pin 标记、原始行顺序和原始文本。
- 不把整个 AGENT.md 自动变成所有六位 Galgame 角色的人格；默认导入为独立的 Global Agent Persona。
- 用户可显式将该 persona 复制/绑定到某个角色，复制后保留来源关系但独立版本化。
- 导入完成前不修改、不删除 AGENT.md；新插件验证完成后也保留用户可回滚的原文件。

## 4. whale-galgame 导入

源文件：`DSH_HOME/storages/dsh-whale-galgame/global.json`，以及可能存在的工作区迁移标记/旧存档副本。

必须保留：
- 当前角色与六个角色各自的等级、好感度、活动时间、token 结算余额。
- 角色昵称、称呼、问候、性格、语气、CG 外观描述。
- 每角色聊天记录、回复选项、已消费任务指纹/记忆。
- 自定义立绘、背景、CG 图鉴、小剧场记录及提示/状态/错误元数据。
- 全局活动队列、显示偏好与其他未知字段。

未知字段必须进入兼容扩展区，不能因 schema 不认识而丢弃。媒体 data URL 需提取为受控文件并计算 hash；迁移报告记录源字段到目标字段映射。

## 5. PPL 导入与状态映射

- Persona IR 保存 persona id/version/IR hash；不把 IR 中的 computed trait 当作 durable user memory。
- Host Snapshot 作为可审计的解析证据，按保留策略保存，不保存完整 transcript。
- Character Governance session ID 与角色 ID 建立稳定映射；初次导入 relationship state 时需通过受控 bootstrap 路径，不能伪造一连串 COMFORT/CONFESSION 事件。
- PPL 当前 dev Character profile 的初始 state 是参考样例，不可直接覆盖 Whale 已有角色状态。
- 对不兼容状态采用显式 conflict report，用户确认后再迁移。

## 6. 幂等、备份与回滚

每次迁移：
1. 计算源文件 hash，记录 migration id。
2. 创建只读备份（不覆盖源文件）。
3. 解析为 staging records，不直接写主表。
4. 执行 schema validation、数量核对、字段 hash/媒体 hash 核对。
5. 同一源 hash + migration version 重跑时返回既有结果，不重复导入。
6. 用户确认后事务性提交。
7. 生成迁移报告，包含导入数、跳过数、冲突、未知字段和校验结果。

回滚通过恢复迁移前数据库快照/备份进行；不得把回滚实现为删除原始源数据。迁移失败时旧插件仍可正常读取旧存档。

## 7. 隐私

- 记忆来源和共享范围必须可见。
- 用户删除记忆时同步删除其派生索引/缓存；审计只保留必要删除事件，不保留被删除正文。
- 不将 Harness 文件内容、工具参数或工具输出自动迁入记忆。
- 外部模型调用使用当前选定 DSH provider；CG 使用本机配置的服务 key。
