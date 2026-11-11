# 内部接口契约 v0.1

## 1. Host Plugin

入口遵循 DSH Cordis plugin contract：
- `export const name`
- `export const inject`
- `export function apply(ctx, config)`

Host plugin 只负责组装依赖、注册生命周期和服务路由。业务规则不写在入口文件。

## 2. Prompt Orchestrator

`assembleAgentPrompt({ basePrompt, persona, runtimeSnapshot, context, budget })`
返回：
`{ text, source, personaId, personaVersion, snapshotHash, charCount, truncated, warnings }`

约束：
- 不修改 base prompt。
- 没有显式启用 persona 时返回空注入。
- Galgame persona 不可作为 Agent persona 的隐式 fallback。
- 同一 agent/turn/persona revision 的结果可确定性去重。

## 3. Persona Registry

- `list({ kind? })`
- `get(id)`
- `upsert(definition, expectedRevision?)`
- `setBinding(scope, scopeId, personaId)`
- `resolveBinding({ scope, scopeId })`

每个 definition 必须具有稳定 ID、kind、version、sourceFormat、contentHash。并发更新使用 revision 检查。

## 4. Memory Service

- `list({ ownerKind, ownerId })`
- `add(input)`
- `mergeCandidate(input)`
- `pin(id, pinned)`
- `remove(id)`
- `export({ ownerKind, ownerId })`

ownerKind 仅允许 `shared` / `character` / `agent-persona`。任何查询必须显式指定 owner，不提供“默认读全部记忆”的接口。

## 5. Character Governance Adapter

- `createSession({ sessionId, characterId, initialState })`
- `getState(sessionId)`
- `applyEvent(sessionId, { eventId, type, payload, source })`
- `getAudit(sessionId)`

适配器负责把 PPL 的返回状态映射为产品 DTO，不暴露 PPL 内部 profile schema 给 UI。eventId 必须稳定；冲突与重复分别返回不同结果。

## 6. Migration

- `inspect(source)`：只读解析，输出 summary / warnings / sourceHash。
- `stage(source, plan)`：生成暂存结果，不写主存储。
- `commit(stagedId, confirmation)`：事务性提交。
- `rollback(migrationId)`：恢复迁移前快照。
- `report(migrationId)`：返回字段级计数、冲突和校验信息。

Migration 不接受任意输出路径；源文件只读。

## 7. Storage

结构化记录通过 repository interface 访问。领域服务不直接依赖 SQLite API。测试可使用 in-memory adapter，生产使用 SQLite adapter。所有 aggregate 更新采用 revision/乐观锁或 SQLite transaction。

## 8. Host API 安全

- 仅注册本插件唯一前缀 `/api/dsh-virtual-avatar`。
- 请求体有大小上限、JSON schema 校验。
- 文件操作限定 DSH_HOME 管理目录。
- 变更操作校验 Origin/CSRF，错误响应不泄漏路径密钥。
- 客户端不直接访问数据库或 PPL Gateway。
