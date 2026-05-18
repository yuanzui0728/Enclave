# 文件索引

## 顶层文档

| 文件 | 用途 |
|------|------|
| `README.md` | 总入口，必读 |
| `00-series-context.md` | 项目背景、调性、视频号 vs 抖音 |
| `00-visual-style.md` | 视觉规范（视频号特化差异点 + 完全复用抖音规范的部分） |
| `00-publish-schedule.md` | 发布日历 + 时段策略 + SOP |
| `00-master-checklist.md` | 出片自检（每条必过 13 项） |
| `00-public-account-link-map.md` | 视频号挂公众号文章配置 + 7 条对照表 |
| `00-file-index.md` | 本文件 |

## 每日文档（day-1 至 day-7）

每个 `day-N/` 下结构：

```
day-N/
├── script.md         旁白逐字稿 + TTS 提示
├── shot-list.md      镜头清单（含每个镜头的画面/字幕/配音/素材路径）
├── cover-spec.md     封面规格（1080×1440 JPG）
├── publish-meta.md   发布文案 + 标签 + 评论区第一条 + 挂哪篇公众号文章
├── data/
│   ├── data.json     当条视频核心数据（JSON）
│   └── chat.md / moments.md / characters.md   人类可读 Markdown 版
└── assets/           当条视频特有的素材（目前为空，Manus 补充）
```

## 共享素材（shared-assets/，软链自 docs/douyin-package/shared-assets/）

```
shared-assets/
├── brand/
│   ├── logo.svg                  品牌 logo 矢量
│   ├── colors.json               品牌色完整定义
│   ├── colors.md                 颜色说明
│   └── poster-*-1080x1350.png    10 张竖屏比例营销海报
├── product-screenshots/          (UI 复刻参考)
│   ├── core-chat.png             聊天页 UI（D1/D2/D4 用）
│   ├── core-moments.png          朋友圈 UI（D2/D4 用）
│   ├── core-group.png            群聊 UI（D3/D4 用）
│   ├── core-feed.png             视频号 UI（D5 用）
│   ├── core-onboarding.png       欢迎页 UI（D1 用）
│   └── core-self-character.png   自我角色编辑页 UI（D6 用）
├── avatars/                      角色头像（PNG + SVG）
│   ├── moments-interactor-axun.svg    阿巡（吐槽型，D1/D2/D3 露脸）
│   ├── lawyer-jianheng.svg/png        林骁（群主，D3 用）
│   ├── teacher-math-lu-heng.svg       老张（嗜辣型，D3 用）
│   ├── teacher-chinese-gu-yan.svg     苏老师（温柔型，D2 用）
│   ├── su-yu-english-coach.svg        苏语（陪伴型，D2 用）
│   ├── lin-chen-sleep-support.svg     林晨（共情型，D2/D6 用）
│   └── self-reflection.svg/png        自我（D6 主角）
└── gifs/
    └── yinjie-core-loop.gif      产品核心循环演示 GIF（D7 蒙太奇可用）
```

## 数据完整性

7 条视频对应数据存于本包 `day-N/data/data.json`，从 yuanzui0728 world 数据库（SQLite，路径 `/data/accounts/91173587559732/database.sqlite`）实际生成内容抽样/虚构而来。Manus 不需要访问数据库本身，只用 JSON。

## 必读顺序

新 Manus 接到任务，按此顺序读：

1. `README.md`（5 分钟）
2. `00-series-context.md`（5 分钟）— 视频号 vs 抖音差异点
3. `00-visual-style.md`（10 分钟）— 重点看差异点
4. `00-master-checklist.md`（先看一遍知道出片标准）
5. `00-public-account-link-map.md`（3 分钟）— 视频号专属环节
6. 第一条要做的 day-N/script.md（10 分钟）
7. 同 day-N/shot-list.md（仔细看每个镜头的素材路径）
8. 同 day-N/data/*.md（确认对话内容）
9. 同 day-N/cover-spec.md + publish-meta.md
10. 开始生产

合计 35-50 分钟可上手开干。
