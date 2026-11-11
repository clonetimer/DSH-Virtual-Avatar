# 上游功能来源与许可基线

## 1. dsh-virtual-person 0.7.2

上游：https://github.com/yimengsuper2432/dsh-virtual-person

| 功能 | 上游实现/证据 | 整合策略 |
|---|---|---|
| 全局 AGENT.md 注入 | `lib/index.js` | 迁移为 Global Agent Persona，不再单独注册第二个注入器 |
| Markdown 编辑页 | `lib/client.js` | 吸收为 Persona Editor |
| 相似记忆合并 | `findSimilar / appendMemory` | 作为记忆导入/兼容策略 |
| pin / 三档分层 / 淘汰 | `isPinned / levelOf / pruneOldestMemory` | 保留语义，增加可视化管理 |
| 单文件原子保存 | Host API | 迁移至事务/原子写入层 |
| 记忆预算 | `pickForInject` | 转换为每请求预算，不丢持久记录 |

边界：该插件是单一全局人格文件，不提供多角色、关系数值或语义检索。原有 Markdown 数据不得被拆分后丢失未知内容。

## 2. dsh-whale-galgame 0.7.0

上游：https://github.com/JAdpp/dsh-whale-galgame

| 功能 | 上游实现/证据 | 整合策略 |
|---|---|---|
| 六角色 Registry | `src/index.ts` ROSTER | 迁移为 Persona Registry 的六个初始角色 |
| 角色设定编辑 | README / mechanics.md | 保留昵称、称呼、问候、性格、语气、CG 描述 |
| 关系成长 | mechanics.md | 原好感/等级曲线作为兼容基线 |
| 跨会话记忆 | global.json | 分角色迁移，不与共享事实混淆 |
| Activity Context | `src/activity-context.ts` | 保留明确用户事件分类与隐私边界 |
| Galgame UI | `src/client/index.ts` | 优先保留，不先重画 UI |
| 小剧场 / CG | `src/index.ts`, mechanics.md | 保留冷却、防刷、题材拦截、可选联网和 DashScope |
| 桌宠 | 内置 pet atlas 与客户端 | 保留动画和进入 Galgame 交互 |

许可：上游程序代码/UI/文档为 MIT；21 张默认图片为 CC BY-NC-SA 4.0，桌宠图集沿用上游 MIT。整合包必须保留 `LICENSE.md`、`NOTICE.md`、`THIRD_PARTY_LICENSES.md` 与上游许可原文；不能把所有资源统一声明为 MIT。

## 3. clonetimer/PPL

上游：https://github.com/clonetimer/PPL

| 能力 | 当前边界 | 整合策略 |
|---|---|---|
| Persona Core 0.3 | Stable reference implementation | 作为结构化人格编译/解析基础 |
| Persona Runtime 0.1 | Stable host-neutral runtime | 作为动态 prompt / snapshot 适配基础 |
| DSH Adapter 0.1 | 固定默认 Persona IR，单人格 | 复用 Host Snapshot / lifecycle 思路，扩展多人格 registry |
| Character Governance | PPL product dev.5 | 独立资格验证后接入；不称 Stable |
| Platform Gateway | 本地无认证开发工作台 | 不作为正式插件必需常驻服务 |

PPL Character Profile 的参考初始值和关系规则不能直接套用 Whale 六个角色。关系状态必须按真实事件和现有用户存档迁移。

## 4. 许可检查清单

- [ ] 保存三个上游 LICENSE / NOTICE 文件原文。
- [ ] Whale 21 张 CC BY-NC-SA 图片逐文件保留来源与署名。
- [ ] 桌宠 spritesheet 保留上游 MIT notice。
- [ ] PPL 各组件许可与分发条款逐包确认；private/workspace 包不默认视为可直接 npm 发布。
- [ ] 汇总 SBOM、版本锁定、上游 commit SHA 与本产品变更记录。
- [ ] 发布前执行素材 hash 和许可清单核对。
