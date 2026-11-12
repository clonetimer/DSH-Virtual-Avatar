# DSH Virtual Avatar

DeepSeek Harness 单插件虚拟人格与陪伴系统。当前首发角色为 **DeepSeek 鲸鱼娘**，以自由对话、长期记忆和关系演化为核心。

## 当前实现范围

- PPL 0.3 人格定义与 Runtime 适配；人格规则不授予工具权限，也不接管主 Agent。
- SQLite 角色状态、事务提交、事件幂等和审计记录。
- 角色私有长期记忆：相关检索、置顶、删除、预算控制和用户确认。
- 长期相处摘要候选：显示来源摘要与 revision，只有用户确认后才覆盖长期摘要。
- PPL 信任/依恋/关系阶段，以及有每日正向成长上限的好感度和等级；私密/公开场景直接驱动 PPL Runtime。
- PPL 关系阶段由信任、依恋和告白事件推进；事件分类、好感变化与 PPL 事件共用同一分类结果。
- PPL 情绪状态由已完成的互动事件驱动，包含焦虑、悲伤、愤怒、羞赧与疲劳；用户压力表达、用户陪伴请求、安慰角色、赞美和休息建议分别处理。
- PPL Persona Runtime Registry 已接入 Host，支持按稳定 Persona ID 创建隔离的 Runtime 实例；当前仅注册 DeepSeek 鲸鱼娘，多角色 UI 与完整角色服务隔离仍在后续阶段。
- 日常聊天界面采用单一“更多”入口组织管理功能；关系与角色状态使用面向用户的中文描述，发送失败保留输入草稿。
- DSH Cordis 插件入口与 Web Client overlay；支持自由聊天、历史分页、角色设定、表情和内置场景切换。
- Whale 旧存档的 DeepSeek 角色导入原型；其他角色明确延期，原始存档保留。

**当前产品不开发 Galgame 章节、剧情分支、结局、游戏式回复选项、小剧场或 CG。** 桌面宠物动画也不作为本阶段交付门槛。上游 Whale 项目仅作为角色设定、存档和素材来源。

当前目标宿主为 DSH 0.2.2-rc.1，要求 Node.js >=24.9.0；CI 采用 Node 24.9.0 / 24 双矩阵。插件通过 `engines.dsh` 声明兼容范围 `>=0.2.2-rc.1 <0.2.3-0`。请查看 [实施状态与验收证据](docs/implementation-status.md)、[PPL-2 情绪状态与互动意图](docs/ppl-emotion-state.md) 和 [PPL Persona Registry](docs/ppl-persona-registry.md)。真实 DSH Web/Desktop 实机安装、真实模型流式调用、备份恢复和迁移回滚仍需验收；当前不是 Stable 发布版。

## DSH 插件安装与 P4 宿主验收

本项目按 DSH 插件包结构组织：
- `package.json` 提供插件入口、`dsh.bundle.patch` 和 Web Client injection。
- `lib/index.js` 导出 Cordis 插件的 `name`、`inject`、`apply`。
- `lib/client.js` 提供 `shell.overlay` 入口。
- `cordis.patch.yml` 将 `dsh-virtual-avatar` 插入 DSH 插件 bundle。
- Host API 前缀为 `/api/dsh-virtual-avatar`。

### Windows 安装：DSH Web 与 Desktop 0.2.2-rc.1

**运行时要求：Node.js 24.9.0 或更高版本。** 在 PowerShell 中先检查：

```powershell
node --version
npm --version
```

从本仓库 GitHub Actions 的 `dsh-virtual-avatar-dsh-0.2.2-rc.1-windows-web-desktop-dev.6` artifact 下载以下文件：
- `dsh-virtual-avatar-0.1.0-dev.6.tgz`
- 对应的 `.sha256` 文件
- `package-info.json`

先校验包文件（在下载目录执行）：

```powershell
Get-FileHash .\dsh-virtual-avatar-0.1.0-dev.6.tgz -Algorithm SHA256
```

将输出与 `.sha256` 文件中的摘要核对。然后通过 DSH 插件管理 CLI 安装本地包：

**DSH Web（web profile）：**

```powershell
dsh plugin --profile web add ".\dsh-virtual-avatar-0.1.0-dev.6.tgz"
dsh --profile web --dump-config
```

**DSH Desktop：** 建议直接使用桌面版「插件 → 添加插件」，输入 `.tgz` 的完整绝对路径。若在 DSH 桌面版「应用 → 管理 dsh 命令…」安装了专用 CLI，可在完全退出 Desktop 后使用其保留的 `desktop` profile：

```powershell
dsh plugin --profile desktop add ".\dsh-virtual-avatar-0.1.0-dev.6.tgz"
dsh --profile desktop --dump-config
```

安装后完全退出并重新启动对应 DSH Web / Desktop，再打开插件页面。确认插件 `dsh-virtual-avatar` 已加载，鲸鱼入口出现，诊断页显示 PPL、SQLite 和模型选择状态。模型连接测试需在 DSH 主界面已配置 Provider 后执行。

**Web 与 Desktop 共用同一个 `dsh.client.platform: web` 客户端模块。** Desktop 通过普通 DSH Web Client 模块图加载插件界面，不需要单独 Electron renderer bundle；Host 仍通过 Cordis bundle patch 注册。Desktop 的实际安装、渲染和窗口重启仍须按 P4 验收表实测，CI 不代替实机验收。

卸载前先创建备份。卸载插件不会作为清理用户数据的操作；不要手工删除 DSH_HOME 下的 `storages/dsh-virtual-avatar`，除非你明确要永久删除角色数据。
## 开发验证

```bash
npm run verify
```

CI 使用固定 PPL Core 提交编译 `personas/deepseek-whale.ppl`，生成并校验 PIR，再运行项目测试。

## 上游与许可

- [dsh-virtual-person](https://github.com/yimengsuper2432/dsh-virtual-person)
- [dsh-whale-galgame](https://github.com/JAdpp/dsh-whale-galgame)
- [PPL](https://github.com/clonetimer/PPL)

保留 `third_party/` 中的上游许可、署名与素材说明。Whale 部分默认图片受 CC BY-NC-SA 4.0 约束，不能视为 MIT 代码素材。

## Desktop 0.2.2-rc.1 与 PPL 场景/情绪运行时（dev.6）

- `dev.1` 的 `lib/client.js` 直接包含 ESM `import`，与 DSH 使用的经典 `<script>` 模块工厂加载协议不兼容，可能在启动时出现 `Cannot use import statement outside a module`。
- `dev.3` 将 `src/client/companion.mjs` 构建为 `window.__ModuleLoader__.load({id:'dsh-virtual-avatar',factory})` 注册格式，React 与 ReactDOM 使用 DSH 平台共享模块，避免双 React 副本。
- 每次运行 `npm run verify` 和 `npm pack` 均执行客户端构建。新增 `node:vm` 经典脚本加载回归，不再仅依赖 `node --check` 检查 ESM 语法。
- 已安装 `dev.1` 的用户应先在 Desktop 插件管理器中禁用或卸载旧版，再安装 `dev.5`；升级不会以清除用户数据为手段。

- `dev.3` 增加持久化互动场景：私密空间使用 `PRIVATE_HOME`，公开场合使用 `PUBLIC_SPACE`；场景由界面显式选择，并在每次对话中交给 PPL Runtime。
- `dev.3` 增加 `acquaintance → trusted → close` 关系阶段演化，以及低信任告白的 `confession` 中间阶段；关系阶段成为亲密表达的主要依据，好感度等级不再单独提升亲密程度。
- 互动事件分类统一供 PPL 和好感度结算使用；“早安/晚安”不再自动加好感，“我不累”等否定表达不会仅因包含“累”而触发安慰事件。
- CI 使用固定 PPL Core 编译 `personas/deepseek-whale.ppl`，自动刷新并提交对应 PIR；Node 24.9.0 / 24 矩阵分别验证运行时和打包。

- `dev.4` 区分“用户表达自己疲惫/压力”与“用户安慰鲸鱼娘”：前者进入支持性回应模式，不增加信任或依恋；后者才进入角色安慰事件。
- `dev.4` 增加用户陪伴请求、角色休息建议和明确赞美事件；早安/晚安等普通寒暄不触发好感变化。
- PPL Runtime 维护角色自身的疲劳、焦虑、悲伤、愤怒和羞赧状态；成功完成的对话才提交状态变化，中断/失败的模型请求不会结算。
- UI 展示角色自身的 PPL 状态指标；这些指标不代表对用户的情绪或健康评估，也不会把用户的短暂压力表达自动写入长期记忆。

## PPL Persona Registry（dev.6）

- PPL Runtime 已抽取为通用 Persona IR 工厂；每次创建 Runtime 都持有独立的 IR 副本和独立的调用状态。
- 新增 PersonaRuntimeRegistry，按稳定的 Persona ID 注册、查询、枚举和创建 Runtime；注册时校验 PPL 0.3 IR schema、Persona ID、必需字段和重复 ID。
- DSH Host 当前通过 Registry 创建 DeepSeek 鲸鱼娘 Runtime，而不是直接依赖单一角色工厂。
- 当前 Registry 只注册 DEEPSEEK_WHALE。其他角色的资料导入、独立角色服务、UI 切换和数据迁移尚未作为已交付能力。

## Companion everyday UX（dev.6）

- 主界面顶部仅保留“更多”和“收起”；搜索对话、关系记录、记忆、角色设定、背景、备份和诊断按类别收纳在“更多”菜单中。
- 记忆、摘要、角色设定、备份和诊断在独立浮层中打开，不再混入聊天消息滚动区域；同一时间只显示一个管理面板。
- 角色状态使用“精力 / 心情 / 表现”等中文描述，不向日常用户展示 PPL 内部状态的原始百分比。
- 关系区去除重复的阶段信息，将 attachment 显示为“亲近度”；互动环境改为“互动场合”，减少内部实现术语。
- 模型请求失败时保留输入草稿；消息发送成功但记忆建议暂不可用时单独提示，不将已成功的对话误报为失败。
- 备份创建、恢复和背景切换等成功结果使用中性提示，不再显示为红色错误。
