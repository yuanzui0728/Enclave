# 素材清单

## 现有素材复用

### 品牌海报（5 套，1080×1350，中英双语，全部用上）
位置：`docs/douyin-package/shared-assets/brand/`

| 文件 | 用于 | 主题 |
|---|---|---|
| poster-private-world-zh-CN-1080x1350.png | Day 1 封面 / Day 7 微头条 | 私人 AI 世界 |
| poster-ai-companion-zh-CN-1080x1350.png | Day 2 配图 / Day 5 配图 | AI 陪伴 |
| poster-moments-calls-zh-CN-1080x1350.png | Day 3 封面 | 朋友圈 + 通话 |
| poster-group-chat-zh-CN-1080x1350.png | Day 4 封面 | 群聊 |
| poster-self-hosted-privacy-zh-CN-1080x1350.png | Day 5 微头条 / Day 6 封面 | 自部署隐私 |

### 角色头像（9 个，用上 5 个 + 群组拼图）
位置：`docs/douyin-package/shared-assets/avatars/`

| 文件 | 用于 |
|---|---|
| lawyer-jianheng.png | Day 1 长文 / Day 2 配图（律师建衡） |
| self-reflection.png | Day 5 封面 / Day 7 微头条（"自己"角色） |
| su-yu-english-coach.svg | Day 1 拼图 |
| teacher-math-lu-heng.svg | Day 4 配图（数学老师陆衡） |
| teacher-chinese-gu-yan.svg | Day 1 拼图 |
| lin-chen-sleep-support.svg | Day 1 拼图 |
| moments-interactor-axun.svg | Day 1 拼图 |

### 产品截图（6 张，用上 5 张）
位置：`docs/douyin-package/shared-assets/product-screenshots/`

| 文件 | 用于 |
|---|---|
| core-moments.png | Day 1 / Day 3（朋友圈截图） |
| core-chat.png | Day 1 / Day 2（聊天界面） |
| core-group.png | Day 4 / Day 7（群聊截图） |
| core-feed.png | Day 3（视频号 / feed 截图） |
| core-self-character.png | Day 1 微头条 #2 / Day 5（"自己"对话截图） |
| core-onboarding.png | Day 6（onboarding 流程） |

### V2EX 截图复用（11 张里用上 5 张）
位置：`docs/v2ex-screenshots/`

| 文件 | 用于 |
|---|---|
| day1-moments.png | Day 3 配图（朋友圈实操） |
| day3-self-character.png | Day 5 配图 |
| day3-group.png | Day 4 配图 |
| day2-poster-self-hosted.png | Day 6 配图 |
| day6-feed-current.png | Day 3 配图 |

### 动图
- `docs/douyin-package/shared-assets/gifs/yinjie-core-loop.gif` —— Day 1 配图 + Day 7 配图（头条支持 GIF 自动播放）

---

## 新增素材清单（5 项，预计 2-3 小时一次性完成）

统一存放到：`docs/toutiao-package/shared-assets/`（需新建目录）

### 1. day1-avatars-9grid.png
**用途**：Day 1 长文图 3 + Day 1 微头条 #1 配图

**规格**：
- 尺寸：1080×1080
- 用 9 个 avatar 拼 3×3 九宫格
- 顺序建议：律师 / 英文教练 / 数学老师 / "自己" / 中文老师 / 林晨 / 阿迅 / 留 2 格用 logo 或随便画 2 个角色补齐
- 背景：白色或浅米色（取 brand colors 里的浅色）
- 间距：4-8 px 白色 gap

**制作方式**：Figma / PS / Canva 5 分钟拼图

### 2. day2-cover-3am.png
**用途**：Day 2 长文封面

**规格**：
- 尺寸：1080×1350（头条文章封面比例）
- 主元素：超大字"凌晨 3:14"（思源黑体 / 苹方 ExtraBold，180pt+）
- 副标：底部一行小字"AI 睡了"（48pt）
- 角标：右上小字"隐界 · 一个有作息的 AI 世界"
- 背景：深蓝紫渐变（夜晚感），主色取 `brand/colors.json` 的 accent 反色
- 装饰：可加月亮 ☾ 或闭着眼的角色头像剪影

**制作方式**：Figma 半小时

### 3. day4-group-drama.png
**用途**：Day 4 配图（增强真实感）

**规格**：
- 尺寸：手机屏宽截图（1080×约 2400）
- 内容：在 enclaveai.top 上随便逛一个群聊，截一段真有戏剧性的对话（20-30 句）
- 处理：遮挡敏感时间戳、马赛克掉真实账号信息（如有）
- 风格：保留原 UI，不要加滤镜

**制作方式**：手动操作 + 截图 + Photoshop 简单遮挡

### 4. day6-data-comparison.png
**用途**：Day 6 长文核心配图

**规格**：
- 尺寸：1080×1080
- 布局：左右对比，中间一条分割线
- 左侧：标题"主流 AI"，下方箭头"你的对话 → 公司服务器"，配灰色调，云端 icon
- 右侧：标题"隐界"，下方箭头"你的对话 → 你的设备"，配品牌橙，手机/电脑 icon
- 底部 caption："数据归属，决定了你能放心说多少"
- 字体：苹方/思源黑体，简洁

**制作方式**：Figma 半小时

### 5. day7-7days-summary.png
**用途**：Day 7 长文压轴配图

**规格**：
- 尺寸：1080×1920（长图，可分享朋友圈）或 1080×1350
- 布局：7 张小卡（每天一张）+ 顶部"7 天 7 个亮点"标题 + 底部 logo
- 每张卡内容：
  - Day 1：AI 有作息 → 凌晨不回你
  - Day 2：朋友圈完全没广告
  - Day 3：群聊里 8 个 AI 自己活
  - Day 4：有个角色叫"自己"
  - Day 5：所有数据在你自己设备
  - Day 6：可以一键全删，不留痕
  - Day 7：上瘾的同时不焦虑
- 配色：品牌橙 + 浅米底
- 每张卡可配该角色的小头像

**制作方式**：Figma 1 小时

---

## 制图统一规范（参考抖音包视觉风格）

- **主色**：橙色系（取自 `docs/douyin-package/shared-assets/brand/colors.json`）
- **辅色**：温暖米黄 + 中性灰
- **字体**：思源黑体 / 苹方 / OPPO Sans 中文
- **风格**：扁平 + 圆角 + 适度留白，避免拟物化

## Checklist

- [ ] 新建目录 `docs/toutiao-package/shared-assets/`
- [ ] 制作 day1-avatars-9grid.png
- [ ] 制作 day2-cover-3am.png
- [ ] 截图 day4-group-drama.png（需登录 enclaveai.top 操作）
- [ ] 制作 day6-data-comparison.png
- [ ] 制作 day7-7days-summary.png
- [ ] 全部素材压到合理体积（< 2 MB / 张，头条上传限制）
