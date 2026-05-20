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
| **Day 3** | `day3/01-character-editor.png` | 主图 · 后台角色编辑器（周燃健身教练）| **Playwright 实截** admin/127.0.0.1:5181 | ✅ 就绪 |
| **Day 3** | `day3/02-self-character.png` | 副图 · 我的 AI 形象 | 复用 `docs/screenshots/core-self-character.png` | ✅ 就绪 |
| **Day 3** | `day3/03-character-factory.png` | 备图 · 角色工厂全流程 | **Playwright 实截** | ✅ 备选 |
| **Day 4** | `day4/01-self-agent-modes.png` | 主图 · 赛博分身主代理工作台 | **Playwright 实截** admin/self-agent | ✅ 就绪 |
| **Day 4** | `day4/02-self-agent-review.png` | 副图 · 复盘对话实例 | **占位卡** | ⚠️ 需现截（脱敏；admin 视角拍不出"温暖陪伴"感，建议用 app） |
| **Day 5** | `day5/01-group-chat.png` | 主图 · AI 5 人群聊互怼 | **占位卡** | ⚠️ 需现截（admin 没有群聊视图，必须起 app 跑真实群） |
| **Day 6** | `day6/01-architecture.png` | 主图 · 技术架构三层图 | 程序生成（Pillow 绘制） | ✅ 就绪 |
| **Day 6** | `day6/02-docker-compose.png` | 副图 · docker compose 三行启动 | 程序生成（终端模拟） | ✅ 就绪 |
| **Day 7** | `day7/01-grid-2x3.png` | 主图 · 6 张核心截图拼图 | 程序生成 | ✅ 就绪 |
| **Day 7** | `day7/02-grid-3x3-with-todo.png` | 备图 · 9 宫格（含 3 个 TODO 位） | 程序生成；现截 3 张后可重跑覆盖 | ✅ 就绪 |

**总览**：13 张图，**11 张已就绪可直接发**，2 张仍需现截（Day4 副图、Day5 主图）。

---

## 还需要现截的 2 张

Day 3 主图 / Day 4 主图已用 Playwright 自动截好（见 `_capture.mjs`）。下面这 2 张 admin 视角无法呈现戏剧感，建议你启动 app（5180）后用 iPhone 真机或浏览器手机模式截。

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

合成类资产（GIF 压缩 / 拼图 / 架构图 / docker 卡 / 占位卡）：
```bash
python docs/marketing/jike-assets/_build.py
```
依赖：`pip install pillow`（Pillow 12+）。

Admin 实截类资产（Day3 角色编辑器、Day4 self-agent）：
```bash
# 前置：pnpm dev:admin 已起 5181；api 已起 3000
node docs/marketing/jike-assets/_capture.mjs
```
脚本会自动注入 admin localStorage 跳过登录 gate，从 `api/database.sqlite` 取真实角色数据。需要不同的角色，改 `_capture.mjs` 的 `SHOTS` 数组里的 route。

---

## 即刻发布小贴士

- **每条最多 4 图最佳**：超过 4 图会折叠成九宫格，文案 hook 的视觉冲击被削弱
- **GIF 单独发**：Day 2 那条只放 GIF 一张，不要混搭静态图
- **拼图发 1 张就够**：Day 7 用 `01-grid-2x3.png` 一张图即可，`02-grid-3x3-with-todo.png` 是备选（如果 3 张 TODO 截完更新了，可以用 3x3 那张显得更"丰收"）
- **GitHub 链接放评论区第一条置顶**：详见配套文稿
