# 上游功能来源与许可基线

## 1. dsh-virtual-person 0.7.2

上游：https://github.com/yimengsuper2432/dsh-virtual-person

| 功能 | 上游实现/证据 | 整合策略 |
|---|---|---|
| 全局 AGENT.md 注入 | `lib/index.js` | 不接入首发陪伴角色，避免覆盖主 Agent |
| Markdown 编辑页 | `lib/client.js` | 只借鉴角色设定编辑与可视化配置方式 |
| 相似记忆合并 | `findSimilar / appendMemory` | 作为角色记忆导入/兼容策略 |
| pin / 三档分层 / 淘汰 | `isPinned / levelOf / pruneOldestMemory` | 保留语义，增加可视化管理 |
| 单文件原子保存 | Host API | 迁移至事务/原子写入层 |
| 记忆预算 | `pickForInject` | 转换为每请求预算，不丢持久记录 |

边界：该插件是单一全局人格文件，不提供多角色关系状态。原有 Markdown 数据不得被拆分后丢失未知内容。

## 2. dsh-whale-galgame 0.7.0

上游：https://github.com/JAdpp/dsh-whale-galgame

| 功能 | 上游实现/证据 | 整合策略 |
|---|---|---|
| 六角色 Registry | `src/index.ts` ROSTER | 只迁移 DeepSeek 鲸鱼娘；其余五位延期 |
| 角色设定编辑 | README / mechanics.md | 保留昵称、称呼、问候、性格、语气 |
| 关系成长 | mechanics.md | 好感/等级作为兼容基线，成长规则由服务统一提交 |
| 跨会话记忆 | global.json | DeepSeek 角色数据迁移，其他角色与源文件完整归档 |
| Activity Context | `src/activity-context.ts` | 只在明确授权和隐私边界内使用 |
| 角色立绘/表情/背景 | 上游资源 | 逐文件核对来源、许可和 hash 后使用 |
| Galgame 剧情、回复分支、小剧场、CG | 上游游戏功能 | 当前产品不开发、不纳入首发验收 |
| 桌宠 spritesheet | 内置 pet atlas 与客户端 | 延后为独立项目切片，不阻塞陪伴主链路 |

许可：上游程序代码/UI/文档为 MIT；默认图片受 CC BY-NC-SA 4.0 约束，桌宠图集沿用上游许可。整合包必须保留 `LICENSE.md`、`NOTICE.md`、`THIRD_PARTY_LICENSES.md` 与上游许可原文；不能把所有资源统一声明为 MIT。

## 3. clonetimer/PPL

上游：https://github.com/clonetimer/PPL

| 能力 | 当前边界 | 整合策略 |
|---|---|---|
| Persona Core 0.3 | Stable reference implementation | 作为结构化人格编译/解析基础 |
| Persona Runtime 0.1 | Stable host-neutral runtime | 作为动态 prompt / snapshot 适配基础 |
| DSH Adapter 0.1 | 固定默认 Persona IR，单人格 | 复用 Host Snapshot / lifecycle 思路，扩展多人格 registry |
| Character Governance | PPL product dev.5 | 独立资格验证后接入；不称 Stable |
| Platform Gateway | 本地无认证开发工作台 | 不作为正式插件必需常驻服务 |

PPL 关系规则必须由已完成的互动事件驱动；关系阶段只影响陪伴表达，不改变事实判断或工具权限。

## 4. 许可检查清单

- [ ] 保存三个上游 LICENSE / NOTICE 文件原文。
- [ ] Whale 默认图片逐文件保留来源、署名和许可。
- [ ] 桌宠 spritesheet 保留上游 notice；未进入当前首发包。
- [ ] PPL 各组件许可与分发条款逐包确认；private/workspace 包不默认视为可直接 npm 发布。
- [ ] 汇总 SBOM、版本锁定、上游 commit SHA 与本产品变更记录。
- [ ] 发布前执行素材 hash 和许可清单核对。
