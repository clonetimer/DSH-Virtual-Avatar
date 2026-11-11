# DSH Virtual Avatar

DeepSeek Harness 单插件虚拟人格与陪伴系统。当前首发角色为 **DeepSeek 鲸鱼娘**，以自由对话、长期记忆和关系演化为核心。

## 当前实现范围

- PPL 0.3 人格定义与 Runtime 适配；人格规则不授予工具权限，也不接管主 Agent。
- SQLite 角色状态、事务提交、事件幂等和审计记录。
- 角色私有长期记忆：相关检索、置顶、删除、预算控制和用户确认。
- 长期相处摘要候选：显示来源摘要与 revision，只有用户确认后才覆盖长期摘要。
- PPL 信任/依恋/关系阶段，以及有每日正向成长上限的好感度和等级。
- DSH Cordis 插件入口与 Web Client overlay；支持自由聊天、历史分页、角色设定、表情和内置场景切换。
- Whale 旧存档的 DeepSeek 角色导入原型；其他角色明确延期，原始存档保留。

**当前产品不开发 Galgame 章节、剧情分支、结局、游戏式回复选项、小剧场或 CG。** 桌面宠物动画也不作为本阶段交付门槛。上游 Whale 项目仅作为角色设定、存档和素材来源。

当前目标宿主为 DSH 0.2.2-rc.1，要求 Node.js >=24.9.0；CI 采用 Node 24.9.0 / 24 双矩阵。插件通过 `engines.dsh` 声明兼容范围 `>=0.2.2-rc.1 <0.2.3-0`。请查看 [实施状态与验收证据](docs/implementation-status.md)。真实 DSH Web/Desktop 实机安装、真实模型流式调用、备份恢复和迁移回滚仍需验收；当前不是 Stable 发布版。

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

从本仓库 GitHub Actions 的 `dsh-virtual-avatar-dsh-0.2.2-rc.1-windows-web-desktop` artifact 下载以下文件：
- `dsh-virtual-avatar-0.1.0-dev.1.tgz`
- 对应的 `.sha256` 文件
- `package-info.json`

先校验包文件（在下载目录执行）：

```powershell
Get-FileHash .\dsh-virtual-avatar-0.1.0-dev.1.tgz -Algorithm SHA256
```

将输出与 `.sha256` 文件中的摘要核对。然后通过 DSH 插件管理 CLI 安装本地包：

**DSH Web（web profile）：**

```powershell
dsh plugin --profile web add ".\dsh-virtual-avatar-0.1.0-dev.1.tgz"
dsh --profile web --dump-config
```

**DSH Desktop：** 使用 Desktop 当前选中的 profile 名称替换下面的 `<profile>`，不要默认猜测 profile 一定叫 web：

```powershell
dsh plugin --profile "<profile>" add ".\dsh-virtual-avatar-0.1.0-dev.1.tgz"
dsh --profile "<profile>" --dump-config
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
