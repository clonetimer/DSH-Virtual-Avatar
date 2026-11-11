# DeepSeek Whale MVP 实施状态

更新基线：PR #1 当前分支 `feat/architecture-baseline`，提交 `7c320b24f3e354279edf6e3d4faa35dead3b46f2`。

## 本轮验收结果

GitHub Actions run #183：
- Node 22.19.0：PPL 编译、3 个 PPL 内置测试、项目检查与单元/集成测试步骤均通过。
- Node 24：上述步骤均通过。
- 自动化测试：26 passed / 0 failed。
- PPL Persona IR 0.3：编译器检查通过，0 errors / 0 warnings；3 个 persona source tests 通过。
- Whale 美术资源与上游 LICENSE / NOTICE / THIRD_PARTY_LICENSES：CI staging 步骤通过。

## 模块状态

| 模块 | 状态 | 证据 / 缺口 |
|---|---|---|
| DeepSeek Whale PPL persona | PASS | PPL 0.3 编译及 3 个内置测试 |
| PPL Runtime adapter | PASS（模块级） | completed / max-tokens 提交门禁；aborted 不提交 |
| Character service | PASS（模块级） | 角色对话准备、关系事件与持久化回归 |
| SQLite state / event ledger | PASS（模块级） | 重启恢复、乐观锁、事件幂等 |
| Memory service | PASS（模块级） | owner 隔离、相似合并、置顶、删除、预算 |
| Memory candidate workflow | PASS（模块级） | 自动只提出候选，需用户点击确认才写入 |
| Whale DeepSeek legacy import | PARTIAL | 保留完整原始 JSON，导入 DeepSeek 的关系/对话字段；图片 data URL 尚未提取成文件 |
| DSH host API | PASS（mock contract） | Host plugin integration test；尚未在真实 DSH Web/Desktop 安装验收 |
| Web overlay UI | PARTIAL | 对话、关系摘要、记忆管理、人格设定编辑；未达到 Whale 原 Galgame UI 全功能平移 |
| Original Whale Galgame | NOT YET | 剧情、小剧场、历史/CG 图鉴与音效等需逐项移植 |
| Desktop pet | NOT YET | spritesheet 动画与桌面生命周期尚未接入 |
| Settings / diagnostics | PARTIAL | API 具备 profile / memory endpoints，完整插件设置和诊断页未完成 |
| Backup / rollback | NOT YET | migration source 原文入库；尚无用户可见备份恢复与安全回滚流程 |
| Web/Desktop real-host qualification | NOT YET | 需要真实 DSH 目标环境 |

## 重要边界

- 首发仅启用 DeepSeek 鲸鱼娘。其余五位角色在迁移预览中明确标记为 deferred，不做隐式转换。
- 主 Agent 人格没有被此插件接管；陪伴提示仅用于本插件的 Galgame chat 请求。
- 关系 trust / stage 由 PPL Runtime 决定；好感度/等级沿用 Whale 游戏进度模型，两个状态域不混用。
- 记忆候选不会自动写入。只有用户明确确认后才保存。
- CI 通过不能替代真实 DSH Web/Desktop 安装、模型供应商调用、跨会话存档和 UI 交互验收。

## 下一轮工作（连续执行）

1. 完成 Whale 原存档中 DeepSeek 角色媒体 data URL 的受控提取、hash 对账和备份恢复。
2. 建立迁移回滚的事务/冲突保护，防止覆盖迁移后产生的新聊天或关系状态。
3. 扩展对话服务：模型生成的三条选项、选择效果与事件结算的完整闭环。
4. 移植 Whale Galgame 原 UI 的对话呈现、表情、背景切换、历史、CG、小剧场和桌宠。
5. 增加设置/诊断页面、隐私说明、Origin 校验和数据导出/删除。
6. 完成 DSH Web 与 Desktop 实机安装验收，再判断是否进入下一发布阶段。
