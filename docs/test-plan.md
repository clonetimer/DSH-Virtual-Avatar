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
