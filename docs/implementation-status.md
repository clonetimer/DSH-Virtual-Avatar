# DSH Virtual Avatar 实施状态（Companion-first）

更新基线：feat/architecture-baseline / b1775eaa56b2a741038ae6f500758586ee575403。
PR #4 已合并至开发分支；PR #5 首次回滚实现因源码结构错误未通过 CI，已关闭且未合并。当前 UX 修复分支：fix/companion-overlay-ux。

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
| Whale DeepSeek 迁移 | PASS（模块级） | PR #4 完成 DeepSeek 媒体提取、资产 URI、原始归档与 hash 校验；需真实旧存档验收 |
| 迁移回滚 | NOT YET | PR #5 已关闭且未合并；需重新实现并通过双版本 CI |
| 完整备份/恢复 | NOT YET | 尚无数据库快照与用户可见恢复入口 |
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

## 已完成：旧存档媒体提取（PR #4）

- 仅处理 DeepSeek 角色与指定全局背景/CG 的图片 data URL。
- PNG/JPEG/WebP/GIF/AVIF 白名单，单文件 12 MiB、单次迁移总媒体 64 MiB 上限。
- 采用内容哈希、资产 URI、原始 JSON 归档与读取时 hash 校验。
- Node 22.19 / 24 CI 通过。

## 下一阶段与发布门槛

1. 重新实现安全迁移回滚：迁移前状态/资产清单、后续写入冲突检测、显式确认、回滚审计。
2. 记忆管理闭环：编辑、导出、删除、来源/共享范围展示；摘要 revision 冲突的可恢复提示。
3. 设置与诊断：模型 provider/model、PPL 编译/IR 版本、SQLite/资产存储、最近错误、备份状态。
4. 修复 overlay 小问题并完成浏览器交互回归；随后做 DSH Web/Desktop 实机安装。
5. 真实模型流式调用、异常中断、刷新重载、跨会话持久化验收。
6. clean install / upgrade / disable / uninstall / restore 回归与发布包审计。

当前不能称为完成的 DSH 插件：真实宿主资格、完整记忆管理、备份恢复、设置诊断和发布生命周期尚未验收。


## 2026-11-11 进度核对补充

- PR #4 已合并到 `feat/architecture-baseline`，合并提交 `b1775eaa56b2a741038ae6f500758586ee575403`；Run #351–#354 均通过。
- PR #5（迁移回滚）因第一次实现把方法插入类定义边界之外，Node 24 `node --check` 失败；已关闭且未合并，开发基线未受影响。
- 当前 PR #1（79 文件、199 commits）仍开放，目标为 `main`；其 head `b1775eaa` 的 Run #355/#356 均通过，但仍需完成目标宿主资格与发布验收后再考虑合并。
- Overlay 顶栏发现“记忆”入口重复，本分支移除重复项并将按钮命名为“记忆管理”。
