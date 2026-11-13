# DyberPet 本地角色动作预览（dev.10）

## 用户入口

打开 DSH Desktop 0.2.2-rc.1 → 鲸鱼娘 → 更多 → 角色与外观 → 动作包预览。无需命令行。

1. 选择一个 DyberPet 原生角色文件夹；不要仅选择 action 子文件夹。
2. 文件夹中应包含 pet_conf.json、act_conf.json 和 action/*.png。
3. 浏览器对 PNG 文件签名和总大小进行检查；随后将配置与文件名发送给同源本地 DSH Host 进行动作结构校验。
4. 验证通过后，界面显示角色文件夹名称、动作数量和帧数。
5. 选择动作，点击「播放动作」「暂停」或「从头预览」，检查表情、动作节奏、帧顺序及形象一致性。
6. 点击「返回聊天」或按 Escape 退出。临时预览资源自动释放。

## 原生数据规范

- 使用 DyberPet 的 pet_conf.json 和 act_conf.json 字段规范。
- 支持动作名、帧前缀、frame_refresh、act_num、移动方向、anchor、patpat 和 random_act 引用。
- 预览图片使用 action/<前缀>_<数字>.png 的原始帧文件。按数字帧号排序而非按字符串排序。
- 单次选择最多 1200 张 PNG、总计 64 MB，每张不超过 6 MB；每份 JSON 配置不超过 64 KB。
- 为减少文件伪装风险，PNG 需通过文件头签名检查；不接受缺失配置、帧路径不安全或引用的动作不存在的文件夹。

## 数据及权限边界

**dev.10 为临时预览；dev.11 增加持久化到本地动作库，但仍不自动启用到鲸鱼娘。**

- 仅预览时，PNG 留在浏览器 File 对象中，用临时 Blob URL 显示，不上传。
- 预览校验只发送动作配置和 PNG 文件名到同源 DSH Host。
- 用户明确导入后，PNG 和动作配置保存到 SQLite 与本地 assets/motion-packs；纳入插件备份。导入不会修改 PPL Runtime、好感度、关系、聊天记录或原始立绘。
- 如果用户选择 DyberPet 的 Kitty/ChrisKitty 示例，可以检查其动作节奏，但不能据此认定鲸鱼娘有了真正逐帧动画。
- 正式启用真实鲸鱼娘逐帧动作前，仍需获得与鲸鱼娘形象一致且授权明确的素材包，并完成素材来源核查、角色匹配和真实 Desktop 运行验收。

## 技术验证

- Client 本地角色文件夹扫描器覆盖配置缺失、非法帧路径、非 PNG 资源和有效 DyberPet 目录。
- Host motion-preview-validate 路由覆盖数字帧排序、时长、重复次数、不合法配置的 400 响应及角色状态不变。
- Client Classic Script regression 覆盖文件夹入口、播放面板、临时 URL 释放和返回聊天按钮。
- Node 24.9.0 / Node 24 仍由 GitHub Actions 验证 PPL、宿主加载及打包。
