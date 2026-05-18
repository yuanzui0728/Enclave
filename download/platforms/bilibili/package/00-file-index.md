# 文件索引

> 本交付包包含 37 个文件 + 14 张素材图（截至打包时）。

---

## 顶层文档（5）

```
docs/bilibili-package/
├── README.md                       # 给 manus 的交付说明（必读）
├── 00-series-context.md            # 项目背景、调性、词典
├── 00-visual-style.md              # 7 集统一视觉规范
├── 00-publish-schedule.md          # 发布日历 + 跨平台
├── 00-master-checklist.md          # 生产进度跟踪
└── 00-file-index.md                # 本文件
```

---

## 每集文档（7 × 4 = 28）

```
day-N/
├── script.md                       # 旁白文稿（带时间码）
├── shot-list.md                    # 镜头清单（每秒细节）
├── cover-spec.md                   # 封面设计规格
├── publish-meta.md                 # B 站发布元数据
└── assets/
    └── PLACEHOLDER-screen-caps.md  # 录屏占位说明
```

7 集 × 5 文件 = 35 个 markdown。其中 1 个是占位说明，所以正文 28 个 + 7 个占位 = 35。

---

## 共享素材（shared-assets）

```
shared-assets/
├── brand/                          # 品牌素材（6）
│   ├── logo.svg
│   ├── poster-ai-companion-zh-CN-1920x1080.png
│   ├── poster-group-chat-zh-CN-1920x1080.png
│   ├── poster-moments-calls-zh-CN-1920x1080.png
│   ├── poster-private-world-zh-CN-1920x1080.png
│   └── poster-self-hosted-privacy-zh-CN-1920x1080.png
├── gifs/                           # 动图（1）
│   └── yinjie-core-loop.gif
└── product-screenshots/            # 产品截图（6）
    ├── core-chat.png
    ├── core-feed.png
    ├── core-group.png
    ├── core-moments.png
    ├── core-onboarding.png
    └── core-self-character.png
```

---

## 总文件数

| 类型 | 数量 |
|---|---|
| Markdown 文档 | 41 |
| 品牌素材（png/svg） | 6 |
| 动图（gif） | 1 |
| 产品截图（png） | 6 |
| **合计** | **54 个文件** |

包大小约 5-10 MB（取决于素材压缩程度）。

---

## 完整目录树

```
docs/bilibili-package/
├── README.md
├── 00-series-context.md
├── 00-visual-style.md
├── 00-publish-schedule.md
├── 00-master-checklist.md
├── 00-file-index.md
│
├── day-1/
│   ├── script.md
│   ├── shot-list.md
│   ├── cover-spec.md
│   ├── publish-meta.md
│   └── assets/PLACEHOLDER-screen-caps.md
│
├── day-2/  (同上结构)
├── day-3/  (同上结构)
├── day-4/  (同上结构)
├── day-5/  (同上结构)
├── day-6/  (同上结构)
├── day-7/  (同上结构)
│
└── shared-assets/
    ├── brand/         (6 files)
    ├── gifs/          (1 file)
    └── product-screenshots/  (6 files)
```

---

## 如何打包交付给 manus

### 方案 A：整包压缩

```bash
cd docs/
tar -czf bilibili-package-v1.tar.gz bilibili-package/
# 产出约 5-10 MB 的压缩包，给 manus 上传
```

### 方案 B：上传到云盘

把整个 `bilibili-package/` 目录直接上传到任意云盘（Google Drive / 百度网盘 / Dropbox），分享链接给 manus。

### 方案 C：推到 GitHub 私有仓库

```bash
cd docs/bilibili-package
git init
git add -A
git commit -m "Initial delivery"
gh repo create --private yinjie-bilibili-delivery
git push -u origin main
```

把仓库地址 + 只读 token 给 manus。

---

## 给 UP 主的话

这个包是"manus 生产视频"的完整说明书。UP 主自己**不需要**逐字看 7 集旁白——
看：
- ✅ `README.md`（整体说明）
- ✅ `00-master-checklist.md`（自检 + 验收）
- ✅ 每集 `publish-meta.md`（发布时要复制粘贴的内容）

不用看（除非感兴趣）：
- ❌ 每集 `script.md`（manus 的工作）
- ❌ 每集 `shot-list.md`（manus 的工作）
- ❌ 每集 `cover-spec.md`（manus 的工作）

manus 产出视频后，UP 主再根据 `00-master-checklist.md` 验收。
