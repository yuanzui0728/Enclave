# Day 1 镜头清单

> 每个镜头：起止时间 / 素材来源 / 屏上字幕 / 转场

**总时长目标**：5:20-5:50（含 2 秒片头 + 3 秒片尾 CTA）

---

## 镜头 001 · 系列片头

- **时间**：00:00-00:02（2 秒）
- **类型**：固定片头模板
- **素材**：🖼️ EXISTING `shared-assets/brand/logo.svg`
- **屏上字幕**：「隐界 · Enclave」+ 副标「Day 1 / 7」
- **转场**：硬切入 + 0.3s 黑场过渡到镜头 002
- **音频**：短促 "叮" 音效（≤ 0.8s）

---

## 镜头 002 · 钩子 - 微信打开瞬间

- **时间**：00:02-00:05（3 秒）
- **类型**：🎨 GENERATE 或 📹 SCREEN-CAP-NEEDED
- **生成提示词**（如 GENERATE）：
  ```
  Mobile phone screen close-up, opening WeChat-style chat list,
  vertical 9:16 framing, slightly tilted, soft warm bokeh background,
  cinematic depth of field, focus on the screen, realistic UI mockup,
  dark mode interface
  ```
- **录屏要求**（如 SCREEN-CAP-NEEDED）：
  - 实机录制：打开隐界 app 主界面（不要 splash screen），停留 2 秒
  - 1080p 30fps，竖屏录制
- **屏上字幕**：（无字幕，纯视觉）
- **转场**：硬切入

---

## 镜头 003 · 钩子 - 朋友圈快速滚动

- **时间**：00:05-00:08（3 秒）
- **类型**：🖼️ EXISTING + 动效
- **素材**：`shared-assets/product-screenshots/core-moments.png`
- **动效要求**：截图做"快速上滚"动效，3 秒滚完全屏，模拟用户狂刷朋友圈
- **屏上字幕**：（无字幕）
- **转场**：白闪 0.3s 过渡到镜头 004

---

## 镜头 004 · 钩子 - 多个 AI 头像群聊弹出

- **时间**：00:08-00:12（4 秒）
- **类型**：🖼️ EXISTING
- **素材**：`shared-assets/product-screenshots/core-group.png`
- **动效要求**：群聊红点数字从 0 → 5 → 12 → 23 跳动，每次跳动伴随轻微震动
- **屏上字幕**：（无字幕）
- **转场**：硬切到镜头 005

---

## 镜头 005 · 钩子旁白配画面

- **时间**：00:12-00:15（3 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Split screen montage: left side a person looking at phone late at night,
  right side a stylized social network graph with AI avatar nodes connecting,
  dark cyberpunk aesthetic, blue and purple lighting, 16:9 cinematic
  ```
- **屏上字幕**：「这不是一个想象 / 这是过去六个月我一个人做出来的东西」
- **转场**：0.2s 黑场到镜头 006

---

## 镜头 006 · 章节卡 - 这是什么

- **时间**：00:15-00:16（1 秒）
- **类型**：章节卡模板（见 `00-visual-style.md` 第 4 节）
- **屏上字幕**：「01 · 这是什么」
- **转场**：黑场淡出，0.3s 后切下一镜

---

## 镜头 007 · 项目名 + 一句话定位

- **时间**：00:16-00:30（14 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Minimalist title card with text "隐界 · Enclave" in large modern Chinese font,
  subtitle "开源 AI 社交平台" below, dark navy background #0A0E1A,
  subtle particle animation
  ```
- **屏上字幕**：
  - 0:16-0:20「隐界 · Enclave」（大字 logo 化）
  - 0:20-0:30「开源版 Character.AI / 自部署 / 一人一世界」（三个标签依次弹出）
- **转场**：硬切

---

## 镜头 008 · 概念示意图

- **时间**：00:30-00:45（15 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Diagram showing a user at center connected by lines to 5-6 AI character avatars,
  each AI has a small lifestyle icon next to them (book, coffee, briefcase, headphones, paint brush),
  clean infographic style, dark background, neon glow lines
  ```
- **屏上字幕**：「微信壳子 + AI 居民 + 完整社交闭环」
- **转场**：0.2s 黑场

---

## 镜头 009 · 章节卡 - 演示开始

- **时间**：00:45-00:46（1 秒）
- **类型**：章节卡
- **屏上字幕**：「02 · 演示开始」
- **转场**：硬切

---

## 镜头 010 · 朋友圈演示 - 多条 AI 自发动态

- **时间**：00:46-01:15（29 秒）
- **类型**：📹 SCREEN-CAP-NEEDED（首选）/ 🖼️ EXISTING 兜底
- **录屏要求**：
  - 打开 app 进入朋友圈 tab
  - 慢速滚动浏览 3 条不同时间戳的 AI 朋友圈（凌晨/中午/傍晚）
  - 每条停留 6-8 秒让观众读完
  - 1080p 30fps 竖屏录制，含真实时间戳
- **兜底素材**：`shared-assets/product-screenshots/core-moments.png` + 拼图做成"3 条贴并排"
- **屏上字幕**（跟随镜头出现的内容动态变化）：
  - 第一条出现时：「凌晨 3:12 发布」
  - 第二条出现时：「中午 12:48 发布」
  - 第三条出现时：「傍晚 18:30 发布」
  - 全程下方注释：「这些都不是我写的——AI 自己发的」
- **转场**：硬切

---

## 镜头 011 · 聊天演示 - 老周对话

- **时间**：01:15-01:50（35 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：
  - 进入"老周"角色的聊天界面（如该角色不存在，使用任一带"心理咨询师"标签的角色）
  - 用户发"在吗"，等待 AI 真实回复（不要快进，让等待感真实）
  - AI 回复"刚醒，迷糊着，怎么了"或近似内容
  - 1080p 30fps 竖屏
- **屏上字幕**：
  - 0:01:15「点开'老周'·心理咨询师人设」
  - 0:01:30「他回得很慢——他正在午休」
  - 0:01:45「这种延迟不是手动设的，是作息表自己算的」
- **转场**：硬切

---

## 镜头 012 · 群聊演示 - 拉群 + 互动

- **时间**：01:50-02:30（40 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：
  - 从联系人页面拉"老周"和"林薇"进新群
  - 用户发"最近压力好大"
  - 等老周回复（共情向），再等林薇回复（带补刀的吐槽）
  - 1080p 30fps 竖屏
- **屏上字幕**：
  - "老周"出现时：「老周 · 朋友」
  - "林薇"出现时：「林薇 · 朋友（与老周）」
  - 全程：「他们俩在关系网里是朋友 → 对话节奏自然延展」
- **转场**：0.2s 黑场

---

## 镜头 013 · 章节卡 - 和 ChatGPT 有什么区别

- **时间**：02:30-02:31（1 秒）
- **类型**：章节卡
- **屏上字幕**：「03 · 和 ChatGPT 有什么区别」
- **转场**：硬切

---

## 镜头 014 · 三栏对比图

- **时间**：02:31-03:00（29 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Three-column comparison infographic, each column shows an AI assistant icon at top
  and bullet points below. Column 1: "ChatGPT - Tool / On-demand / Stateless".
  Column 2: "Character.AI - Single thread / 1-to-1 / No social".
  Column 3: "Enclave - World / Active / Social loop", highlighted in yellow.
  Dark theme, modern flat design, 16:9
  ```
- **屏上字幕**：旁白每说到一个产品，对应列高亮放大 1.05x
- **转场**：0.2s 黑场

---

## 镜头 015 · "主动性"概念可视化

- **时间**：03:00-03:20（20 秒）
- **类型**：🎨 GENERATE + 动效
- **生成提示词**：
  ```
  Animated visualization: a clock face spinning showing 24 hours, around it
  small AI avatar icons doing activities at different times - one posting,
  one sleeping, one in group chat, all happening simultaneously,
  abstract minimal style, dark teal background
  ```
- **屏上字幕**：「你不打开 app 的时候 / 他们也在过日子」
- **转场**：硬切

---

## 镜头 016 · 章节卡 - 一人一世界 + 开源

- **时间**：03:20-03:21（1 秒）
- **类型**：章节卡
- **屏上字幕**：「04 · 一人一世界 + 开源」
- **转场**：硬切

---

## 镜头 017 · "一人一世界" 架构示意

- **时间**：03:21-04:00（39 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Architecture diagram: multiple isolated bubbles, each containing one user
  silhouette surrounded by AI character avatars, bubbles are visually separated
  by space, no connecting lines between bubbles. Label below each bubble:
  "User A's world", "User B's world", etc. Subtitle below diagram:
  "数据全在自己的机器上". Clean infographic, dark navy background
  ```
- **屏上字幕**：
  - 0:03:21「一人一世界」（大字标语）
  - 0:03:30「你的数据 = 你自己的数据库 SQLite」
  - 0:03:45「服务端没有一个汇总你所有人的大库」
  - 0:03:55「你不是大数据的产品，你是自己 AI 世界的主人」（这句要强调）
- **转场**：硬切

---

## 镜头 018 · 开源 + Docker 提示

- **时间**：04:00-04:30（30 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Terminal window with the command "docker compose up -d" prominently displayed,
  green text on dark background, MIT License badge floating in corner,
  GitHub octocat icon, retro hacker aesthetic but clean
  ```
- **屏上字幕**：
  - 0:04:00「MIT 协议」
  - 0:04:10「Docker Compose 一行命令」
  - 0:04:20「不希望这变成下一个被资本垄断的赛道」
- **转场**：0.2s 黑场

---

## 镜头 019 · 章节卡 - 局限

- **时间**：04:30-04:31（1 秒）
- **类型**：章节卡
- **屏上字幕**：「05 · 它远远没到完美」
- **转场**：硬切

---

## 镜头 020 · 局限可视化

- **时间**：04:31-05:00（29 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Notebook page with handwritten todo list, items marked: "Long-term memory: fuzzy",
  "Mobile animation: occasional frame drops", "Group chat with 10+ characters: unstable".
  Photo realistic notebook on a wooden desk, soft warm lighting,
  vulnerable honest aesthetic
  ```
- **屏上字幕**：
  - 0:04:31「长期记忆做得还很粗糙」
  - 0:04:42「移动端动画偶尔掉帧」
  - 0:04:52「群聊角色多了容易塌房」
- **转场**：0.2s 黑场

---

## 镜头 021 · 下集预告

- **时间**：05:00-05:25（25 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Stylized social media comment thread showing 5-6 AI avatars commenting on a post,
  some comments showing emotional reactions like "你说错了" / "我不同意" / "哈哈哈" /
  arguing tone, comment thread getting heated. Dark UI, bilibili thumbnail style
  ```
- **屏上字幕**：
  - 0:05:00「明天 Day 2」
  - 0:05:10「6 个 AI 在我朋友圈里互相评论同一条贴」
  - 0:05:18「结果他们差点打起来」
- **转场**：0.3s 白闪到镜头 022

---

## 镜头 022 · 系列片尾 CTA 卡

- **时间**：05:25-05:28（3 秒）
- **类型**：固定片尾模板（见 `00-visual-style.md` 第 2 节）
- **屏上字幕**：标准 CTA 卡 + 「Day 1 / 7」+「下一集：AI 互怼朋友圈」
- **音频**：BGM 淡出 + 片头音效收尾变体
- **转场**：黑屏结束

---

## 镜头数量与节奏统计

- 总镜头数：22
- 平均镜头时长：14 秒
- 章节卡数：5（约占总时长 5 秒）
- EXISTING 素材数：3
- GENERATE 提示词数：10
- SCREEN-CAP-NEEDED 镜头数：3（朋友圈/聊天/群聊演示）

---

## 关键节点强调

| 时间 | 内容 | 重要度 |
|---|---|---|
| 0:00-0:15 | 钩子段——决定 60% 完播率 | ⭐⭐⭐⭐⭐ |
| 1:15-2:30 | 演示三连——决定信任建立 | ⭐⭐⭐⭐ |
| 3:21-3:55 | "一人一世界" 概念阐释——决定差异化记忆点 | ⭐⭐⭐⭐ |
| 5:00-5:25 | 下集预告——决定追更率 | ⭐⭐⭐⭐⭐ |

manus 在剪辑时，这 4 段是不能压缩或省略的。其他段落可以根据实际录屏时长 ±10%。
