# Day 1 镜头清单 · 什么是隐界（开篇）

**总时长**：60 秒
**镜头数**：6 个
**核心数据源**：`day-1/data/data.json`（产品全貌截图清单 + 4 个 AI 朋友的简介）

---

## 镜头 1 [0:00–0:05] · 钩子蒙太奇

**素材来源**：🎨 GENERATE

**画面**：
- 4 屏快切（每屏约 1.2s）：
  1. 微信工作群（仿真截图，未读 99+，群名打码，画面打浅马赛克避开商标）
  2. 微博热搜吵架（仿真截图，红字"#xxx#"，评论区一堆"你 NM"）
  3. 抖音陌生人脸（4 宫格陌生人头像）
  4. 黑屏 0.3s 过渡
- 整体色调灰冷
- 镜头 4 后 0.2s 闪白进入镜头 2

**字幕**：「屏幕上很热闹，但没人在跟你说话」（白字 70px，Y=1100，**最后一句"在跟你说话"强调字 88px 橙色**）

**音效**：4 次"叮"消息提示音（每屏 1 次，节奏紧凑）

**配音**：女声「你今天打开微信，是工作群和广告。打开微博，是吵架和热搜。打开抖音，是 200 个陌生人的脸。屏幕上很热闹，但没人，在跟你说话。」

**风险词检查**：标"抖音""微信""微博"必须打浅马赛克（30% 透明度），不能出现清晰 logo

---

## 镜头 2 [0:05–0:18] · 引出隐界

**素材来源**：📹 SCREEN-CAP + 🖼️ EXISTING

**画面**：
- 0.5s 隐界 logo 闪现（米色背景 `#fef7ed`，logo 居中 200×200）
- 切到 APP 欢迎页（参考 `shared-assets/product-screenshots/core-onboarding.png` 复刻）
- 模拟手指点击"进入隐界" → 主聊天列表渐入
- 聊天列表显示 4 个 AI 朋友头像（见 data.json）+ 最近消息

**字幕**：「所以我做了一个东西，叫隐界」（白字 70px，Y=1100，"隐界"强调字 88px 橙色）

**配音**：女声「所以我做了一个东西，叫隐界。」

**UI 复刻关键**：
- 聊天列表参考 `shared-assets/product-screenshots/core-chat.png`
- 4 个 AI 头像见 data.json `characters`
- 用户头像默认+昵称 "w"

---

## 镜头 3 [0:18–0:30] · 4 屏功能蒙太奇

**素材来源**：📹 SCREEN-CAP

**画面**：
- 4 屏快切（每屏 3s），上下滑动展示：
  1. 聊天列表（`core-chat.png` 复刻）—— 4 个 AI 朋友头像 + 最近消息
  2. 朋友圈（`core-moments.png` 复刻）—— 一条 NPC 朋友圈 + 3 条评论
  3. 群聊（`core-group.png` 复刻）—— 群里 5 条消息
  4. 视频号（`core-feed.png` 复刻）—— 一个 NPC 的视频卡片
- 镜头之间 0.1s 硬切，不要 dissolve

**字幕**：滚动出现"聊天 · 朋友圈 · 群聊 · 视频号"（4 个词依次浮现，每个 70px 白字）

**配音**：无（让画面自己说话）

**音效**：每屏切换时一次"嗖"快速过渡音

---

## 镜头 4 [0:30–0:50] · 朋友圈展开 + AI 互动

**素材来源**：📹 SCREEN-CAP（基于 data.json `moments[0]`）

**画面**：
- 切到朋友圈一条 NPC 动态特写：林晨发了一张深夜书桌照片，配文"今天写到第 12 页了，加油"
- 0.5s 后，3 条 AI 评论依次浮现：
  - 阿巡：「12 页？我家狗都比你快」（吐槽）
  - 苏老师：「晚安。早点休息。」（温柔）
  - 林骁：「@阿巡 闭嘴」（互怼）
- 镜头特写到"@阿巡 闭嘴" 时停留 1.5s

**字幕**：「他们彼此认识、彼此点赞、偶尔吵架」（白字 70px，Y=1100，**"偶尔吵架"强调字 88px 橙色**）

**配音**：女声「这里没有真人。但有一群已经在这里生活了一段时间的 AI 朋友。他们有自己的作息、自己的朋友圈，他们彼此认识、彼此点赞、偶尔吵架。」

**UI 复刻关键**：
- 4 个角色头像见 data.json
- 评论区参考 `shared-assets/product-screenshots/core-moments.png`
- 评论气泡：浅灰背景 `#f1f1f1`，文字 `#1a1a1a`

---

## 镜头 5 [0:50–0:55] · 字幕收束

**素材来源**：纯字幕卡片

**画面**：
- 渐黑 0.3s 黑场
- 中央字幕大字浮现（fade-in 200ms）：
  - 第 1 行：「你不是这个世界的用户。」（70px 白字，Y=900）
  - 第 2 行（停 0.5s 后浮现）：「你是这个世界的居民之一。」（88px 橙字 `#f97316`，Y=1050）
- 停留 2s 后 fade-out 200ms

**字幕**：见画面（整段字幕本身就是镜头主体）

**配音**：女声「你不是这个世界的用户。你是这个世界的居民之一。」（"居民之一"重音）

**音效**：BGM 此处达到本片最高音量（仍 -18dB）

---

## 镜头 6 [0:55–1:00] · 落幕 + logo

**素材来源**：🖼️ EXISTING

**画面**：
- 全黑 fade-in
- 隐界 logo 居中 200×200（来源：`shared-assets/brand/logo.svg`）
- 下方小字「一个属于你的 AI 虚拟世界」（思源黑体 Regular 36px 白色）
- 再下方更小字「↓ 点击下方了解更多」（24px 浅灰，提示扩展链接）
- 停留 1.5s 后全黑结束

**配音**：无

**音效**：BGM 切断（不要淡出）

---

## BGM

**主曲**：`Pixabay - Calm Piano` 或 `Bensound - Sweet` 钢琴版
**起始**：0:00 进入（-22dB 衬底）
**高潮**：0:50 镜头 5 略升至 -18dB
**结尾**：0:55 镜头 6 开始时切断

---

## 录屏画面包装规范

录屏画面：
- 占据画面中央，宽度 960px（高度自适应，保留原比例）
- 12px 圆角 + 2px `#262626` 描边
- 录屏画面外的背景：当前帧高斯模糊 60px 扩展填满 1080×1920

字幕区：**Y 1100-1480**（视频号特化，比抖音上移 100px，避开扩展链接卡片）

---

## 素材清单

| 资源 | 路径 | 状态 |
|------|------|------|
| 隐界 logo | `shared-assets/brand/logo.svg` | ✅ |
| 4 个 AI 头像 | `shared-assets/avatars/{moments-interactor-axun,lin-chen-sleep-support,teacher-chinese-gu-yan,lawyer-jianheng}.svg` | ✅ |
| 聊天列表参考 | `shared-assets/product-screenshots/core-chat.png` | ✅ |
| 欢迎页参考 | `shared-assets/product-screenshots/core-onboarding.png` | ✅ |
| 朋友圈参考 | `shared-assets/product-screenshots/core-moments.png` | ✅ |
| 群聊参考 | `shared-assets/product-screenshots/core-group.png` | ✅ |
| 视频号参考 | `shared-assets/product-screenshots/core-feed.png` | ✅ |
| 品牌色 | `shared-assets/brand/colors.json` | ✅ |
| 朋友圈数据 | `day-1/data/data.json` `moments[0]` | ✅ |
| BGM | Pixabay Calm Piano | 🔲 Manus 选定 |
| 仿真平台截图 | （4 张工作群/微博/抖音仿真，Manus 生成） | 🔲 |
