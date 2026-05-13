# Day 2 镜头清单

**总时长目标**：3:30-3:50（含 2 秒片头 + 3 秒片尾）

---

## 镜头 001 · 系列片头

- **时间**：00:00-00:02（2 秒）
- **类型**：固定片头模板
- **素材**：🖼️ EXISTING `shared-assets/brand/logo.svg`
- **屏上字幕**：「隐界 · Enclave」+「Day 2 / 7」
- **转场**：硬切 + 0.3s 黑场

---

## 镜头 002 · 钩子 - 朋友圈评论数飙升

- **时间**：00:02-00:08（6 秒）
- **类型**：🖼️ EXISTING + 动效
- **素材**：`shared-assets/product-screenshots/core-moments.png`
- **动效要求**：
  - 截图聚焦于某一条朋友圈
  - 评论数字从 0 → 3 → 6 → 12 快速跳动
  - 点赞图标周围撒出粒子动效
  - 字幕「我没让他们说话。他们自己开始评论了」
- **屏上字幕**：右下角浮动数字"评论 +12"
- **转场**：白闪 0.3s

---

## 镜头 003 · 钩子 - 评论文字快速滚动

- **时间**：00:08-00:15（7 秒）
- **类型**：📹 SCREEN-CAP-NEEDED（首选）/ 🎨 GENERATE 兜底
- **录屏要求**：实机录制评论区滑动，让真实评论文字快速划过
- **生成兜底提示词**：
  ```
  Stylized social media comment thread, 5-6 different avatar
  reactions stacked vertically, comments visible showing tension:
  "你说错了" / "我不同意" / "哈哈哈" / "这逻辑不对".
  Vertical scrolling motion blur, dark UI mode
  ```
- **屏上字幕**：「6 个 AI 角色 / 同一条朋友圈 / 差点打起来」（每秒一行依次出现）
- **转场**：硬切

---

## 镜头 004 · 章节卡 - setup

- **时间**：00:15-00:16（1 秒）
- **类型**：章节卡
- **屏上字幕**：「01 · 这 6 个 AI 是谁」
- **转场**：硬切

---

## 镜头 005 · 6 个角色亮相

- **时间**：00:16-00:30（14 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Six character avatar portraits arranged in a 2x3 grid, each portrait
  has a name label below and personality tag (理性派/心理咨询师/文艺青年/
  对手关系/恋人/导师). Diverse stylized illustrations, anime-influenced
  but professional. Dark background, soft rim lighting on each portrait.
  Names in Chinese: 老马, 老周, 小宋, 陆铭, 林薇, 阿杰
  ```
- **屏上字幕**：每个角色头像旁出现「关系：XX」标签
- **转场**：0.2s 黑场

---

## 镜头 006 · 关系网示意图

- **时间**：00:30-00:45（15 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Network graph visualization: 6 avatar nodes arranged in a circle,
  connecting lines between them with labels "朋友", "对手", "导师",
  "恋人", "熟人". Different line colors for different relation types
  (green for friend, red for rival, blue for mentor, pink for lover,
  gray for acquaintance). Clean infographic style, dark theme
  ```
- **屏上字幕**：「5 种关系 / 每两个人都有一段前史 / 这不是装饰，是数据」
- **转场**：硬切

---

## 镜头 007 · 章节卡 - 实验

- **时间**：00:45-00:46（1 秒）
- **类型**：章节卡
- **屏上字幕**：「02 · 开始实验」
- **转场**：硬切

---

## 镜头 008 · 发布朋友圈瞬间

- **时间**：00:46-01:00（14 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：实机录制——打开朋友圈发布页，输入"今天工作好累，想转行"，点发送，看见自己的贴出现在顶部
- **屏上字幕**：「我的输入：今天工作好累，想转行」
- **转场**：5 秒"等待"过渡（黑屏 + "5 分钟后..." 文字）

---

## 镜头 009 · 评论 1：老马（理性派）

- **时间**：01:00-01:20（20 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：评论区出现老马的头像和评论"转行的真正含义是放弃一次复利"
- **特写处理**：评论文字放大、聚焦
- **屏上字幕**：「老马 · 理性派」「评论 1 / 5」
- **转场**：硬切

---

## 镜头 010 · 评论 2：老周（共情派）

- **时间**：01:20-01:40（20 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：评论区追加老周："累不一定是工作的问题，要不要聊聊"
- **屏上字幕**：「老周 · 心理咨询师」「评论 2 / 5」
- **转场**：硬切

---

## 镜头 011 · 评论 3：小宋（文艺青年）

- **时间**：01:40-02:00（20 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：评论区追加小宋："离职那天我哭着吃了一碗面"
- **屏上字幕**：「小宋 · 文艺青年」「评论 3 / 5」
- **转场**：0.3s 白闪（转折点）

---

## 镜头 012 · 评论 4：陆铭（对手出现）

- **时间**：02:00-02:15（15 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：评论区追加陆铭："楼上几位说得轻巧，转行的成本你们扛得起？"
- **视觉处理**：陆铭头像旁加红色"对手"标签 + 红框高亮该评论
- **屏上字幕**：「陆铭 · 与老马是对手关系」「冲突点 ⚠」
- **转场**：硬切

---

## 镜头 013 · 评论 5：老马回怼

- **时间**：02:15-02:30（15 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：老马追加回复直接回陆铭
- **视觉处理**：老马与陆铭头像之间画一条红色对话连接线
- **屏上字幕**：「老马回怼陆铭」「我没让他们说话——他们自己决定继续」
- **转场**：0.2s 黑场

---

## 镜头 014 · 章节卡 - 原理

- **时间**：02:30-02:31（1 秒）
- **类型**：章节卡
- **屏上字幕**：「03 · 背后的逻辑」
- **转场**：硬切

---

## 镜头 015 · prompt 拼装示意

- **时间**：02:31-03:00（29 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Code snippet visualization showing how AI prompt is assembled:
  "你的人格: 理性派 + 你和陆铭的关系: 对手 + 关系前史: 三年前一次创业失败的争吵"
  Each component highlighted in different colors, arrows pointing
  to a central "Final Prompt" box. Modern code editor aesthetic,
  dark theme with syntax highlighting
  ```
- **屏上字幕**：
  - 02:35「关系类型 + 强度 + 关系前史」
  - 02:45「都注入 prompt 里」
  - 02:55「朋友袒护 / 对手吐槽 / 导师拆解 / 恋人撒娇」
- **转场**：硬切

---

## 镜头 016 · 下集预告

- **时间**：03:00-03:25（25 秒）
- **类型**：🎨 GENERATE
- **生成提示词**：
  ```
  Animated clock face showing 3:00 AM, beside a phone with a chat
  bubble showing "..." (typing indicator but stalled). Misty atmospheric
  lighting, mysterious mood, dark blue palette
  ```
- **屏上字幕**：
  - 03:00「明天 Day 3」
  - 03:10「为什么我给每个 AI 都做了 24 小时作息表」
  - 03:18「凌晨 3 点找他——他可能真的不回」
- **转场**：0.3s 白闪

---

## 镜头 017 · 系列片尾 CTA

- **时间**：03:25-03:28（3 秒）
- **类型**：固定片尾模板
- **屏上字幕**：标准 CTA + 「Day 2 / 7」+「下一集：AI 也要睡觉」
- **转场**：黑屏结束

---

## 关键节奏说明

这一集是系列里**最短**的一集（3:30），但是**奇观浓度最高**——每 15-20 秒一定要有一次"啊"的瞬间：
- 00:08 - 评论快速涌入
- 00:30 - 6 个角色亮相
- 02:00 - 对手出现（红色高亮要明显）
- 02:15 - 老马回怼（连接线动效要直观）
- 03:10 - 下集预告

这 5 个节点都不能压缩。其他段落可以根据实际录屏 ±15%。
