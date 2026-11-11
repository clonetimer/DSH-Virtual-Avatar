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

当前 CI 采用 Node 22.19 / 24 双矩阵。请查看 [实施状态与验收证据](docs/implementation-status.md)。真实 DSH Web/Desktop 实机安装、真实模型流式调用、备份恢复和迁移回滚仍需验收；当前不是 Stable 发布版。

## DSH 插件安装

本项目按 DSH 插件包结构组织：
- `package.json` 提供插件入口、`dsh.bundle.patch` 和 Web Client injection。
- `lib/index.js` 导出 Cordis 插件的 `name`、`inject`、`apply`。
- `lib/client.js` 提供 `shell.overlay` 入口。
- `cordis.patch.yml` 将 `dsh-virtual-avatar` 插入 DSH 插件 bundle。
- Host API 前缀为 `/api/dsh-virtual-avatar`。

### 本地开发安装

1. 使用 Node.js 22.19 或更高版本。
2. 将仓库放入 DSH 可加载的本地插件/扩展目录，或按当前 DSH 插件管理器的本地插件方式添加该包。
3. 在 DSH bundle 中应用仓库的 `cordis.patch.yml`，并确认插件名为 `dsh-virtual-avatar`。
4. 启动 DSH Web，确认插件加载日志无错误。
5. 打开页面右下角鲸鱼按钮，发送一条自由对话测试消息。
6. 通过“记忆”“整理记忆”和“设定”入口验证记忆确认、摘要确认和人格配置的持久化。

空的 `chatProvider` / `chatModel` 默认尝试跟随 DSH 主界面当前模型；若宿主未提供当前模型选择，可在插件 config 中显式配置。插件不要求单独运行 PPL Gateway。

> DSH 不同发行版的插件目录与安装管理方式可能不同；以上是包结构和 bundle 接入方式，不能代替目标版本的真实安装验收。

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
