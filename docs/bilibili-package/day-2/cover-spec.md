# Day 2 封面设计规格

> 输出：`output/day-2/cover.jpg`，1146×717

---

## 设计意图

这是系列**流量爆点集**，封面必须**强情绪冲击**：
- 红色警示色 = "冲突"
- 多个 AI 头像并排 = "他们在吵架"
- 标题尽量短促，让缩略图也能传达"这是个戏"

---

## 布局

```
┌──────────────────────────────────────────────────────────┐
│   [上半 1/3]                                              │
│   大字标题区                                              │
│                                                          │
│   AI 自己吵起来了                                         │
│   ─────────────                                           │
│                                                          │
│   [下半 2/3]                                              │
│   6 个 AI 头像横排（带评论气泡）                          │
│                                                          │
│   [😡]→ [🤔] → [😢] → [😤] → [💢]                        │
│                                                          │
│   评论 评论 评论 评论 评论                                │
└──────────────────────────────────────────────────────────┘
```

---

## 文字层

### 主标题
- 文字：「AI 自己吵起来了」
- 字体：思源黑体 Heavy
- 字号：180px
- 颜色：#FFFFFF
- 描边：8px 红色 #EF4444 外描边 → 再加 4px 黑色描边（双层描边，戏剧感）
- 位置：画面顶部 1/3，居中

### 副标题
- 文字：「我没让他们说话 / 他们自己开始互怼」
- 字体：思源黑体 Bold
- 字号：48px
- 颜色：#FBBF24
- 位置：主标题下方 30px

### Day 徽章
- 文字：「Day 2 / 7」
- 与 Day 1 同款样式，位置左下角

---

## 图像层

### 背景
- 主色：暖红渐变 #7F1D1D → #EF4444（顶部深 → 底部亮）
- 叠加噪点纹理（10% 透明）
- 顶部添加"+ 12 评论" / "+ 5 点赞" 等浮动数字（半透明，装饰）

### 6 个 AI 头像横排
- 来源：🎨 GENERATE 6 个虚拟角色头像
- 提示词：
  ```
  Six diverse anime-influenced character portraits in a horizontal row,
  each with distinct facial expression conveying emotion:
  1. cool intellectual (老马) - smug
  2. warm therapist (老周) - concerned
  3. artistic introvert (小宋) - sad
  4. sharp critic (陆铭) - irritated
  5. cheerful peer (林薇) - laughing
  6. supportive friend (阿杰) - worried
  Each portrait in a circular frame, dark background,
  consistent stylistic treatment
  ```
- 每个头像下面挂一个评论气泡（白色背景+黑字，3-5 字短句体现情绪）
- 头像之间用红色虚线连接，象征"对话流"

---

## 自检

- [ ] 缩略图 300×188 下能读出"AI 自己吵起来了"
- [ ] 6 个头像辨识度高，至少 2 个能看出表情
- [ ] 红色不要太刺眼（用 #EF4444 而非纯红 #FF0000）

---

## 备选 B（极简版）

如果默认版"太满"：
- 单一大字「AI 互怼朋友圈」（220px）
- 背景：纯黑 + 几个评论文字飞过的动态模糊
- 右下角小图："6 个头像缩略图"
