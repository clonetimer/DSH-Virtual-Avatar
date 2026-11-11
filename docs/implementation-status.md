# DSH Virtual Avatar 实施状态（Companion-first）

更新基线：feat/architecture-baseline / 1228f34c1bdee391ed8324e33fe0e43090ef965e。
本轮工作分支：feat/migration-media-assets；PR #4 目标为开发分支，不直接修改 main。

## 已验收基线

- PR #3 已合并到开发分支，PR #2 已关闭并标记 Superseded。
- GitHub Actions Run #344：Node 22.19.0 与 Node 24 均通过；42 tests passed / 0 failed。
- PR #1 的 post-merge Run #346、#347 以及后续 Run #348 均通过双版本 CI。
- PPL Persona 0.3：编译 0 errors / 0 warnings，生成 IR 与源文件一致。
- 以上属于 CI 与模块级证据，不等同于真实 DSH Web/Desktop 实机验收。

## 模块状态

| 模块 | 状态 | 证据与限制 |
|---|---|---|
| DeepSeek PPL Persona / Runtime | PASS（模块级） | 固定版本编译、人格测试、完成/中断提交门禁 |
| 自由对话 Host API | PASS（mock contract） | 模型流式接口契约与 Origin / Fetch Metadata 测试；真实 DSH provider 尚未实机验证 |
| SQLite 角色状态与事件账本 | PASS（模块级） | 事务、乐观锁、幂等、重启恢复 |
| 角色长期记忆 | PASS（模块级） | owner 隔离、相关检索、相似合并、pin/delete、预算 |
| 长期相处摘要 | PASS（模块级） | source hash、revision 检查、用户确认后写入 |
| 关系与好感成长 | PASS（模块级） | PPL trust/attachment/stage；每日正向好感上限已接入真实结算 |
| Whale DeepSeek 迁移 | PARTIAL | 状态导入与原始来源归档；本分支正在补媒体提取与 hash 对账 |
| 受限迁移回滚 | PASS（模块级） | 保存迁移前版本与迁移后 revision；检测后续写入冲突；仅清理本次创建的媒体资产 |
| 完整备份/恢复 | NOT YET | 仍需数据库快照和用户可见备份恢复入口 |
| Web overlay UI | PASS（模块级） | 自由聊天、历史分页、记忆管理、摘要确认、设定、表情与场景切换 |
| 设置/诊断 | PARTIAL | 尚缺完整存储、模型、PPL、最近错误与备份状态诊断页 |
| DSH Web/Desktop 实机资格 | NOT YET | 需要目标 DSH 发行版、真实模型调用和跨会话证据 |
| 安装/升级/卸载 | NOT YET | 需要干净环境与用户数据保留测试 |

## 当前产品边界

- 首发仅启用 DeepSeek 鲸鱼娘。
- 只做自由对话、长期记忆、关系成长和日常陪伴。
- Galgame 章节、分支、结局、游戏选项、小剧场和 CG 不属于首发范围。
- 桌面宠物动画延后，不阻塞陪伴主链路。
- 陪伴人格不接管主 Agent 身份、工具权限或任务执行。

## 本轮：迁移媒体资产提取

目标：
1. 仅提取 DeepSeek 角色和指定全局背景/CG 中的 data URL。
2. 使用内容哈希与白名单 MIME 建立本地媒体资产。
3. 角色状态只保存 asset URI；完整原始 JSON 仍保留在迁移归档。
4. SQLite 提交失败时回收本轮新增文件；读取时重新核验 hash。
5. 对其他角色的媒体明确标记 deferred，不混入 DeepSeek。

## 下一阶段

1. 完成数据库快照、备份校验与用户可见恢复入口。
2. 完成记忆编辑、导出、删除和摘要冲突提示。
3. 补全设置/诊断界面与干净安装、升级、卸载回归。
4. 获取真实 DSH Web/Desktop 环境完成模型流式调用、刷新与跨会话验收。
