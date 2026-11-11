# 测试计划与验收矩阵

## 测试层级

| 层级 | 覆盖 | 通过标准 |
|---|---|---|
| Unit | Registry、prompt、memory parser、migration parser、event idempotency | 确定性、边界与失败用例全通过 |
| Contract | Host API DTO、PPL adapter DTO、storage repository | schema/错误语义兼容 |
| Migration | virtual-person / Whale / PPL fixtures | 原文件不变、数量/hash 对账、可重复 |
| Host integration | Cordis hooks、webServer routes、settings/client injection | 无重复注册、无 hook 冲突 |
| Browser | Galgame、角色切换、桌宠、设置页 | 关键交互回归 |
| Release | clean install、upgrade、rollback、uninstall | 单插件交付可恢复 |
| Target qualification | DSH Web / Desktop 实机 | 分平台记录版本、环境、步骤和证据 |

## 必测风险

- 注入重复、persona switch 后旧缓存未失效、compaction 后 persona 丢失。
- 主 Agent 与 Galgame 角色提示串线。
- 记忆相似合并误合并、pin 丢失、字符预算截断重要记忆。
- eventId 重用但 payload 改变、并发重复提交、SQLite 重启恢复。
- Whale 存档中未知字段丢失、data URL 损坏、历史顺序变化。
- 迁移过程中断、重复导入、备份失败、回滚失败。
- PPL 不可用、IR hash 不匹配、Profile schema 不兼容。
- 小剧场取材 opt-out 未生效、CG 请求误上传本地图片/密钥。
- 插件卸载误删用户数据。

## CI 要求

每次 PR 运行：
- Node 22.19.x 和当前 Node LTS；
- lint/typecheck（若使用 TypeScript）；
- unit/contract/migration tests；
- release audit（素材 hash、许可文件、bundle 文件列表）。

真实 DSH Web/Desktop 验收不能在 CI mock 中替代。
