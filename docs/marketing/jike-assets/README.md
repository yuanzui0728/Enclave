# 即刻 7 天发布 · 图片资产包

配套文稿：[`../jike-7days-2026-05-12.md`](../jike-7days-2026-05-12.md)

按天命名，发布时直接按目录顺序传。带 `TODO · 待截图` 占位的是需要你自己跑项目去截屏覆盖的位置。

---

## 资产清单

| 天 | 文件 | 用途 | 来源 | 状态 |
|---|---|---|---|---|
| **Day 1** | `day1/01-onboarding.png` | 主图 · 5 幕叙事入场 | 复用 `docs/screenshots/core-onboarding.png` | ✅ 就绪 |
| **Day 1** | `day1/02-moments.png` | 副图 · AI 朋友圈 | 复用 `docs/screenshots/core-moments.png` | ✅ 就绪 |
| **Day 2** | `day2/01-core-loop.gif` | 主图 · 核心闭环 GIF | 由 `yinjie-core-loop.gif` 压缩，618 KB | ✅ 就绪 |
| **Day 3** | `day3/01-character-editor.png` | 主图 · 后台角色编辑器 | **占位卡** | ⚠️ 需现截 |
| **Day 3** | `day3/02-self-character.png` | 副图 · 我的 AI 形象 | 复用 `docs/screenshots/core-self-character.png` | ✅ 就绪 |
| **Day 4** | `day4/01-self-agent-modes.png` | 主图 · 赛博分身三档模式 | **占位卡** | ⚠️ 需现截 |
| **Day 4** | `day4/02-self-agent-review.png` | 副图 · 复盘对话实例 | **占位卡** | ⚠️ 需现截（脱敏） |
| **Day 5** | `day5/01-group-chat.png` | 主图 · AI 5 人群聊互怼 | **占位卡** | ⚠️ 需现截（9 屏拼图最佳） |
| **Day 6** | `day6/01-architecture.png` | 主图 · 技术架构三层图 | 程序生成（Pillow 绘制） | ✅ 就绪 |
| **Day 6** | `day6/02-docker-compose.png` | 副图 · docker compose 三行启动 | 程序生成（终端模拟） | ✅ 就绪 |
| **Day 7** | `day7/01-grid-2x3.png` | 主图 · 6 张核心截图拼图 | 程序生成 | ✅ 就绪 |
| **Day 7** | `day7/02-grid-3x3-with-todo.png` | 备图 · 9 宫格（含 3 个 TODO 位） | 程序生成；现截 3 张后可重跑覆盖 | ✅ 就绪 |

**总览**：12 张图，**8 张已就绪可直接发**，4 张需要你跑项目现截覆盖。

---

## 需要现截的 4 张（重要）

按发布顺序排，**Day 1 / Day 2 发布期间就要把这 4 张截好**。

### Day 3 主图：`day3/01-character-editor.png`
- 页面：后台管理端 → 角色编辑器
- 路径：`apps/admin` → `character-editor-page.tsx`
- 截图要点：在一屏里同时露出 **人设 / 作息 / 关系网** 三个区域（必要时缩小浏览器宽度或滚屏拼接）
- 目的：让观众看到"你能像捏小说人物一样捏 AI"

### Day 4 主图：`day4/01-self-agent-modes.png`
- 页面：主 App → 赛博分身入口
- 路径：`apps/app` → `self-agent-page.tsx`（或对应路由）
- 截图要点：**陪伴 / 复盘 / 整理** 三档模式选择界面，文字要清晰可读
- 目的：让观众第一眼理解"三档差异"

### Day 4 副图：`day4/02-self-agent-review.png`
- 页面：和赛博分身的一次真实复盘对话
- 截图要点：**脱敏**（用昵称代替真名/真实信息）；选一次 AI 在"观察你"而非"安慰你"的对话
- 目的：证明赛博分身不是 yes-man

### Day 5 主图：`day5/01-group-chat.png`
- 页面：主 App → 群聊页面
- 路径：`apps/app` → `group-chat-page.tsx`
- 截图要点：**真的拉一个 5 人 AI 群跑一遍**，最好截连续 9 屏（用 iPhone 长截 / 多屏拼接）；让大家看到"AI 之间在自己吵"
- 目的：Day 5 是高潮，这张是整周流量峰值候选

---

## 重新生成

如果改了截图素材或想调拼图样式，运行：

```bash
python docs/marketing/jike-assets/_build.py
```

脚本会重新生成：GIF 压缩、Day 7 拼图、Day 6 架构图、4 张 TODO 占位卡。**已经覆盖为真实截图的文件不会被覆盖**（脚本只生成占位卡和合成图）。

依赖：`pip install pillow`（Pillow 12+ 即可）。

---

## 即刻发布小贴士

- **每条最多 4 图最佳**：超过 4 图会折叠成九宫格，文案 hook 的视觉冲击被削弱
- **GIF 单独发**：Day 2 那条只放 GIF 一张，不要混搭静态图
- **拼图发 1 张就够**：Day 7 用 `01-grid-2x3.png` 一张图即可，`02-grid-3x3-with-todo.png` 是备选（如果 3 张 TODO 截完更新了，可以用 3x3 那张显得更"丰收"）
- **GitHub 链接放评论区第一条置顶**：详见配套文稿
