# 庄方宜角色形象素材审查记录

## 角色身份

本项目第二个 PPL Persona `ZHUANG_FANGYI` 对应《明日方舟：终末地》的庄方宜。PPL IR 中的身份、阵营与职务用于确定角色人格；桌宠美术必须以真实角色视觉资料为准，不以文本描述自行猜造背面服饰。

## 已核实素材

### 官方 Q 版参考

- GRYPHLINE STORE 商品页：[Chibi Acrylic Stand Set - Springwake Pavilion - Zhuang Fangyi](https://store.gryphline.com/products/arknights-endfield-chibi-acrylic-stand-set-springwake-pavilion-zhuang-fangyi)
- 商品信息确认这是庄方宜的官方 Q 版亚克力立牌套装。
- 当前可见商品图为单张正面构图，不能视为正/侧/背完整三视图，也不能从一张图片拆帧制作动画。

### 角色原设和游戏模型参考

- 官方干员档案：[庄方宜 - 明日方舟：终末地](https://endfield.hypergryph.com/operator)
- 角色信息和素材整理：[Warfarin Wiki - 庄方宜](https://warfarin.wiki/cn/operators/zhuang-fangyi)
- 多角度模型展示参考：[EndfieldWorld X](https://x.com/EndfieldWorld/with_replies)（社区发布的游戏模型角度展示，不作为官方美术授权证明，也不作为可分发资源）。

## 公开仓库与个人使用边界

- 不将官方商品图、游戏原始立绘、拆包游戏模型或社区转载图提交到公开 `DSH-Virtual-Avatar` 仓库。
- 公开仓库仅保留资源加载代码、manifest schema、来源审查记录与测试。
- 经用户确认的个人使用素材放入私有交付包或私有资源库，并保留来源与使用范围说明。
- 不把第三方美术素材标记为原创，也不从不同角色拼接发型、服装、表情或动作帧。

## 当前技术状态

- 已实现每角色独立的 `dsh-virtual-avatar.character-artwork/1` manifest。
- Host 只提供 manifest 白名单中明确登记的本地文件，并校验路径、文件类型、大小和符号链接。
- 客户端优先显示该角色自己的 portrait 和后续 expressions。
- 庄方宜 manifest 当前状态：`awaiting-approved-artwork`。没有美术文件被打包；UI 明确显示「角色立绘待导入」。

## 视觉生产门禁

1. 选定并确认庄方宜 Q 版外观基准。
2. 完成同一角色的正面、侧面、背面全身设定，统一比例、发型、角饰、服装、鞋和配色。
3. 由用户确认三视图；背面不可见细节必须明确标记为推断，不冒充官方设定。
4. 确认后再制作透明背景桌宠立绘和表情图。
5. 静态立绘通过后再绑定动作包；动作帧必须同角色、同服装、同画风，不从不同图源拼接。
6. 通过 Windows DSH Desktop 实机测试后，才将素材加入私有 dev 安装包。

## 待用户确认

官方 Q 版商品图只有正面。可选路径是以官方 Q 版形象作为风格基准，结合官方游戏模型角度资料制作一张原创的三视图概念稿供确认；或由用户提供已授权的完整三视图/角色素材。没有确认之前，不生成最终桌宠立绘、不启用动画，也不把推断细节写成官方设定。
