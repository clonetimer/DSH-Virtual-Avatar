# 测试计划与验收矩阵

## 测试层级

| 层级 | 覆盖 | 通过标准 |
|---|---|---|
| Unit | Persona、关系事件、成长额度、记忆清理、记忆检索、摘要候选 | 确定性、边界与失败用例全通过 |
| Contract | Host API DTO、PPL adapter DTO、storage repository | schema/错误语义兼容 |
| Migration | Whale DeepSeek fixture、unknown fields、源 hash | 原文件不变、数量/hash 对账、可重复 |
| Host integration | Cordis hooks、webServer routes、模型流、存储提交 | 无重复注册、无 hook 冲突、失败回合不提交 |
| Browser | 自由聊天、历史分页、记忆管理、摘要确认、角色设定、表情/背景切换 | 关键交互回归 |
| Release | clean install、upgrade、rollback、uninstall | 单插件交付可恢复 |
| Target qualification | DSH Web / Desktop 实机 | 分平台记录版本、环境、步骤和证据 |

## 必测风险

- 主 Agent 与 Companion Character Prompt 串线或重复注入。
- 记忆相似合并误合并、pin 丢失、字符预算截断重要记忆。
- 自动记忆候选或摘要候选在用户确认前被写入。
- 摘要 expectedRevision 过期、并发更新覆盖。
- eventId 重用但 payload 改变、并发重复提交、SQLite 重启恢复。
- 每日正向成长额度未生效、跨日重置错误、重复事件重复加好感。
- 模型中断/空输出/超时后错误提交关系或聊天记录。
- Whale 存档中未知字段丢失、源文件被修改、媒体 hash 不一致。
- 迁移过程中断、重复导入、备份失败、回滚失败。
- PPL 不可用、IR hash 不匹配、Profile schema 不兼容。
- 插件卸载误删用户数据。

## 当前明确不测的产品路径

Galgame 章节、剧情分支、剧情结局、游戏式回复选项、小剧场和 CG 不属于当前产品范围；桌面宠物动画延期。相关上游素材和源存档只做许可、备份和迁移核对。

## CI 要求

每次 PR 运行：
- Node 22.19.x 和 Node 24；
- PPL source compile / IR consistency；
- `npm run check`；
- unit / contract / migration tests；
- release audit（素材 hash、许可文件、bundle 文件列表）。

真实 DSH Web/Desktop 验收不能由 CI mock 替代。


## P4 — DSH host qualification protocol

### Qualification boundary
- Package declares a Cordis host plugin entry and a Web client injection. This is not evidence that a specific DSH release accepts the bundle patch or that Desktop embeds the same Web client runtime.
- Run the protocol separately for DSH Web and DSH Desktop. Record exact DSH build/version, OS, Node runtime (if exposed), install method and date.
- A mock Host test or GitHub Actions run is contract evidence only; it cannot be marked as real-host qualification.

### P4-A: package/install
1. Run `npm ci`, `npm run verify`, `npm pack --dry-run --json`.
2. Confirm the package audit reports required entry/client/host/PPL/assets/patch files and excludes tests, CI checkout, SQLite/database files and local credentials.
3. Install the resulting package using the target DSH version's supported local plugin workflow.
4. Apply the supplied Cordis patch only in a disposable/test DSH bundle first.
5. Confirm exactly one plugin instance and one `/api/dsh-virtual-avatar` route are registered.

### P4-B: real model
1. Select a configured provider/model in DSH's main model settings.
2. Open the whale companion and run the diagnostics model test.
3. Send one short Chinese message; confirm streamed completion and no duplicate response.
4. Cause a controlled invalid-provider or offline failure; confirm bounded error display and no persisted partial turn.
5. Confirm the main Agent's selected provider/model and prompt remain unchanged.

### P4-C: persistence/reload
1. Create a memory, change profile and send multiple turns.
2. Reload the Web page; confirm chat, memory, profile and relationship state persist.
3. Disable/re-enable or restart the plugin using supported DSH controls; confirm route is disposed/re-registered once and data remains.
4. Create a backup, alter state, restore it and verify media, memory, profile and relationship values.
5. Confirm diagnostics contains no API keys/provider credentials.

### P4-D: Desktop
1. Repeat P4-A through P4-C in DSH Desktop.
2. Verify whether the target Desktop release supports the declared `dsh.client.platform: web` injection model; do not infer support from Web.
3. Verify window close/reopen and application restart behavior.

### Evidence record
For each platform capture: DSH version/build, OS, install route, package filename + SHA-256, bundle patch result, plugin load log, model test result (credential-free), chat screenshot, reload persistence, backup restore result, disable/uninstall data-retention result, tester/date, blockers. Mark PASS only with evidence; use BLOCKED when the target runtime/build is unavailable.


## DSH 0.2.2-rc.1 compatibility target

- Bundle declares `engines.dsh: >=0.2.2-rc.1 <0.2.3-0`; installation/profile startup should reject versions outside this range.
- Runtime requirement raised to Node.js >=24.9.0, matching the 0.2.2 RC host baseline.
- CI matrix is Node 24.9.0 and current Node 24, replacing the unsupported Node 22.19 lane.
- Install using the supported Bundle/Profile workflow: `dsh plugin --profile web add <local-path-or-tarball>`; restart `dsh web`; inspect `dsh --profile web --dump-config`.
- Bundle patch references the package name `dsh-virtual-avatar`; package must include `cordis.patch.yml` and both host/client entry points.
- Desktop compatibility is not inferred from Web. Repeat the same install and client injection test in the target Desktop 0.2.2-rc.1 distribution.
