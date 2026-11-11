# DSH Virtual Avatar

统一的 DeepSeek Harness 虚拟人格与陪伴插件。目标是把人格定义、长期记忆、多角色关系、Galgame 交互和桌宠体验整合为一个可安装、可迁移、可验证的产品。

> 当前阶段：架构基线建立中。尚未宣称完成插件实现或 PPL 生产集成。

## 产品目标

- 一个 DSH 插件安装入口，支持 Web / Desktop profile。
- 多人格注册、切换、自定义；人格提示与主 Agent 工作能力边界清晰。
- 每个角色独立记忆，同时支持经用户授权的共享用户事实。
- 保留 dsh-whale-galgame 的六角色、Galgame、小剧场、CG、桌宠和任务事件感知。
- 以 PPL Persona Core / Runtime 作为人格规则与动态快照引擎；以 PPL Character Governance 作为关系状态治理候选实现。
- 兼容迁移既有 virtual-person、whale-galgame 和 PPL 数据；迁移前备份，迁移可审计、可回滚。
- 不以删减现有能力换取表面上的单插件整合。

## 上游项目

| 项目 | 整合职责 | 上游 |
|---|---|---|
| dsh-virtual-person | 全局人格文档、Markdown 记忆合并/置顶/淘汰、人格编辑体验 | https://github.com/yimengsuper2432/dsh-virtual-person |
| dsh-whale-galgame | 六角色、Galgame UI、小剧场、CG、桌宠、工作事件感知 | https://github.com/JAdpp/dsh-whale-galgame |
| PPL | Persona DSL / Runtime / DSH Adapter / Character Governance | https://github.com/clonetimer/PPL |

上游代码和素材按各自许可保留 NOTICE、署名及来源。特别是 whale-galgame 的默认美术包含 CC BY-NC-SA 4.0 素材，不能把图片随 MIT 代码一并重新许可。

## 当前架构原则

1. **单插件入口，不等于单体业务模型。** Persona、Memory、Character Relationship、Galgame、Pet 分层，保持独立领域模型。
2. **单一提示词编排器。** 禁止两个插件分别注册相互竞争的全局人格注入。
3. **状态所有权明确。** PPL 管理可解释人格规则与关系治理；宿主产品负责会话、展示、媒体与用户交互；记忆服务负责记忆条目的生命周期。
4. **分角色记忆隔离。** 角色私有记忆默认不可互相读取；共享事实单独分区并提供用户可见管理。
5. **事件驱动且幂等。** 好感、信任、关系阶段不能由 UI 任意写值，必须由有来源的事件经规则处理。
6. **迁移优先于替换。** 先只读盘点和导入验证，再切换写入；保留原始数据备份与迁移报告。
7. **失败安全。** PPL 不可用时，按明确的降级策略使用已验证的人格提示，不得静默丢失状态或重复结算事件。

## 版本与资格边界

- dsh-virtual-person 当前审查基线：0.7.2。
- dsh-whale-galgame 当前审查基线：0.7.0；Node 要求为 ^22.19.0 或 >=24。
- PPL 当前产品 README 为 1.0.0-dev.5，非 Stable；其 Core 0.3 / Runtime 0.1 有独立 Stable 基线，但 Character Governance 与产品 Gateway 仍须按本项目目标环境重新资格验证。
- 初期统一产品 Node 最低版本按 Node 22.19.0 设计。
- 当前没有完成 DSH Web/Desktop 实机端到端验证；后续报告必须区分单元测试、契约测试、宿主集成测试和真实目标环境验收。

## 文档

- [产品需求规格](docs/requirements.md)
- [架构决策与模块边界](docs/architecture.md)
- [内部接口契约](docs/interface-contracts.md)
- [实施路线与验收门槛](docs/roadmap.md)
- [数据模型与迁移策略](docs/data-migration.md)
- [测试计划](docs/test-plan.md)
- [当前实施状态与验收证据](docs/implementation-status.md)
- [功能基线与来源矩阵](docs/feature-baseline.md)

## 开发状态

目前先建立产品边界、接口契约和迁移基线，再进行宿主插件骨架和适配器实现。每个阶段以可复现测试和 GitHub 记录验收，不把设计文档当成功能完成证明。
