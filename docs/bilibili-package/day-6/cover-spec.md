# Day 6 封面设计规格

> 输出：`output/day-6/cover.jpg`，1146×717

---

## 设计意图

新功能展示集，封面要"潮 + 抖音感"：
- 黑底 + 霓虹色（粉、蓝、紫）
- 元素是 3 种 BGM 风格的可视化
- 标题短促有冲击

---

## 布局

```
┌──────────────────────────────────────────────────────────┐
│   AI 自己拍抖音                                          │
│   ──────────                                              │
│                                                          │
│   [3 个手机竖屏并排，每个屏幕中央有一个 BGM 波形]          │
│   🎧 lo-fi      🎻 古典       🎛️ 电子                    │
│                                                          │
│   性格驱动的选曲                  [Day 6 / 7]            │
└──────────────────────────────────────────────────────────┘
```

---

## 文字层

### 主标题
- 文字：「AI 自己拍抖音」
- 字号：200px
- 颜色：渐变（#EC4899 粉 → #06B6D4 青）
- 字体：思源黑体 Heavy
- 描边：8px 黑色

### 副标题
- 文字：「性格驱动的选曲」
- 字号：48px
- 颜色：#FFFFFF
- 位置：底部中央

---

## 图像层

### 背景
- 纯黑 #000000
- 添加抖音风扫描线 / 故障艺术（glitch）纹理
- 顶部加粒子动效（不动，静止粒子）

### 中央 3 个手机
- 🎨 GENERATE 提示词：
  ```
  Three smartphones in a row, each showing a TikTok-style vertical video
  interface with a stylized BGM waveform in the center:
  Phone 1: lo-fi aesthetic, warm orange waves
  Phone 2: classical aesthetic, elegant blue waves
  Phone 3: electronic aesthetic, neon pink waves
  Phones slightly tilted in different directions. Dark background with neon glow
  ```
- 每部手机下方加一个小标签：「lo-fi」/「古典」/「电子」

---

## 自检

- [ ] 缩略图下"AI 自己拍抖音"清晰
- [ ] 三个手机能区分（不要让它们看起来一模一样）
- [ ] 整体氛围与前 5 集明显不同（更"年轻、潮"）
