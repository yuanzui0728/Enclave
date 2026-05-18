# Day 3 封面设计规格

> 输出：`output/day-3/cover.jpg`，1146×717

---

## 设计意图

知识区调性集，封面要"沉静 + 信息感"：
- 时间元素是主视觉（钟表/时间线）
- 反差感："AI 在睡觉" 是大字钩子
- 暖黄色调区别于 Day 1/2 的冷蓝/暖红

---

## 布局

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   AI 也要睡觉                  [大钟图标 03:12]            │
│   ──────────                                              │
│   凌晨 3 点找他，                                          │
│   他真的不回                                              │
│                                                          │
│   [24 小时甘特图条 — 横贯画面底部]                         │
│   [Day 3 / 7]                                            │
└──────────────────────────────────────────────────────────┘
```

---

## 文字层

### 主标题
- 文字：「AI 也要睡觉」
- 字体：思源黑体 Heavy
- 字号：200px
- 颜色：#FFFFFF
- 描边：6px #92400E（暗棕） + 3px 黑色双层描边
- 位置：左上 1/3，占主视觉重心

### 副标题
- 文字：「凌晨 3 点找他，他真的不回」
- 字体：思源黑体 Bold
- 字号：56px
- 颜色：#FBBF24
- 位置：主标题下方 40px

---

## 图像层

### 背景
- 渐变：顶部 #92400E（暖棕）→ 中部 #FBBF24（暖黄）→ 底部 #92400E
- 整体噪点纹理 8% 透明，柔化平面感

### 右上钟表
- 🎨 GENERATE 提示词：
  ```
  Vintage analog clock showing 3:12 AM, brass and dark wood texture,
  soft warm lamp light from the side, slightly tilted angle, photo-realistic
  ```
- 位置：画面右上 1/3，大小约 400×400

### 底部甘特图条
- 🎨 GENERATE 提示词：
  ```
  Horizontal Gantt timeline bar showing 24 hours (00:00 to 24:00),
  with colored segments labeled: 睡眠 (1-9, purple), 工作 (10-12,
  blue), 午餐 (12-13, orange), 工作 (14-18, blue), 自由时间 (19-23,
  pink), 睡前 (23-1, gradient). Clean infographic, transparent background
  ```
- 位置：画面底部 1/6，宽度铺满

---

## 自检

- [ ] "AI 也要睡觉" 在缩略图下清晰
- [ ] 钟表能看出"3:12"
- [ ] 甘特图配色清晰，能识别多个时段
