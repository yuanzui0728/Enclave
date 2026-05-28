# download/ — 隐界推广物料分发中心

> 这个目录是隐界（Enclave）所有**对外发布物料**的统一入口：各大平台的周内容包、视觉素材、压缩分发包、共享复盘模板、投稿工具清单。
>
> 它**不是**项目代码，不是用户面向的下载页（用户下载 APP 走 [apps/site/...../download](../apps/site/src/app/%5Blocale%5D/download)）。这里是**运营 / 推广团队**的素材库。

---

## 当前节奏（2026-05-18）

按 [90 天创业作战路线图](../.claude/plans/fancy-questing-fog.md)：

| 阶段 | 时间 | 启用的素材 |
|---|---|---|
| **Month 1–3：海外优先** | Week 1–12 | 海外渠道为主（HN / Reddit / PH / Twitter / GitHub / HF）— 国内素材**冻结**备用 |
| **Month 4+：国内开闸** | Week 13+ | 启用 `platforms/` 下国内 9 平台的 7 天内容包 |

> 当前阶段在 `platforms/` 里**不要**主动启用国内平台账号——先把 BYOK 开源版的获客飞轮和 Cloud SaaS 变现跑通，再回头吃国内流量红利。

---

## 目录结构

```
download/
├── platforms/         # 按平台分类的推广物料
│   ├── bilibili/      # B 站 — 7 天 UP 主稿件 + 截图 + v1 包（5.4M）
│   ├── kuaishou/      # 快手 — 完整 v1 包（936K）
│   └── wechat-channels/  # 微信视频号 — 完整 v1 包 + tar.gz（8.1M）
├── _shared/           # 跨平台共享素材
│   ├── marketing/     # Reddit 测试稿、复盘模板（each 7-day 的 retro 落地点）
│   └── characters-research/  # 医生/婚礼策划等角色研究稿
└── helpers/           # 通用工具
    └── awesome-submissions.md  # 各内容平台投稿清单与模板（8K）
```

---

## 平台素材就绪度速查

✅ = 物料完整就位，文案落地 · 🟡 = 仍在 `docs/` 原位（被代码/README 强引用，未迁）

| 平台 | 状态 | 路径 | 含什么 |
|---|---|---|---|
| 微信公众号 | 🟡 | `../docs/wechat-7day-content.md` | 7 篇深度文案（被 12 处引用，保留原位） |
| 抖音 | 🟡 | `../docs/douyin-package/` | 抖音内容包（19 处强引用） |
| 微信视频号 | ✅ | `platforms/wechat-channels/` | 完整内容包 + v1.tar.gz |
| B 站 | ✅ | `platforms/bilibili/` | 7 天 UP 主稿 + 视觉风格 + 截图 + tar.gz |
| 快手 | ✅ | `platforms/kuaishou/package/` | 完整 v1 包（character bible / publish schedule / day-N） |
| 今日头条 | 🟡 | `../docs/toutiao-package/` | 完整内容包（10 处强引用） |
| V2EX | 🟡 | `../docs/v2ex-week1-posts.md` + `../docs/v2ex-screenshots/` | 7 篇技术贴（与 toutiao 互相引用，保留原位） |

> 🟡 项目搬到 download/ 后会破坏 30+ 处内部引用，因此保留在 `docs/`。运营用的时候按上面"路径"列直接打开即可，物理位置不影响使用。

---

## 海外渠道素材（Month 1–3 当前要做的）

⚠️ **这部分 download/ 下还没有**——需要 Week 2 新写：

- HN Launch post 文案
- Reddit 5 个 sub 的发帖模板（r/LocalLLaMA · r/SelfHosted · r/SideProject · r/OpenSourceAI · r/CharacterAI_Refugees）
- Product Hunt 提交材料（tagline、5 张截图、maker comment）
- Twitter Build-in-Public thread 模板（30 天日更）
- HuggingFace Space 营销页

写好后会落到 `download/platforms/` 下新建的 `hn/` · `reddit/` · `product-hunt/` · `twitter/` · `huggingface/` 子目录。

> 已经存在的英文起点：[BYOK.md](../BYOK.md) · [README.en.md](../README.en.md) · `apps/site/src/app/[en]` landing。

---

## 何时回来用国内平台素材

满足以下**任一**条件，把 `platforms/` 下的 7 个国内平台启用起来：

1. 海外 Cloud SaaS MRR ≥ $1k（Month 3 末目标的 2 倍），有底气开第二战线
2. 海外发完 HN/PH 但留存数据弱，需要换大盘验证 PMF
3. 用户主动来自国内（GitHub Stars 里 cn 域名 > 30%）

启动时按 [`helpers/awesome-submissions.md`](helpers/awesome-submissions.md) 走一遍投稿清单。

---

## 维护规则

1. **每个 7 天周期结束**：把当周复盘写到 `_shared/marketing/<平台>-week<N>-retro.md`（命名规范）
2. **新增平台素材**：在 `platforms/` 下建新目录，复用 `bilibili/package/` 的命名规范（00-file-index / 00-master-checklist / 00-publish-schedule / 00-visual-style / day-N）
3. **更新本 README 的就绪度速查表**：新加平台或状态变化时同步更新
4. **不要把对外发布物料和 `docs/` 的产品文档混在一起**：`docs/` 是技术/产品文档（被代码引用），`download/` 是营销/推广物料

---

📮 联系作者：yuanzui0728@gmail.com · ⭐ 喜欢请给仓库点 Star
