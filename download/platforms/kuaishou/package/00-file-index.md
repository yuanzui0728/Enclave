# 文件索引

## 顶层文件（地基）

| 文件 | 用途 | 必读？ |
|---|---|---|
| README.md | 总说明、落地顺序 | 必读 |
| 00-file-index.md | 本文件 | 速查 |
| 00-master-checklist.md | Manus 制片清单（按顺序勾） | 必读 |
| 00-publish-schedule.md | 7 天发布时刻表 | 必读 |
| 00-series-context.md | 系列调性、产品话术、调性禁区 | 必读 |
| 00-visual-style.md | 字幕/转场/配色/BGM/封面/录屏包装规范 | 必读 |
| 00-character-bible.md | 老磊 + 7 个 AI 角色完整人设 | 必读 |

## 每日文件

| Day | 主题 | 时长 | 主角 | 文件 |
|---|---|---|---|---|
| 1 | 凌晨 5 点的豆浆 | 75s | 王翠芳 | day-1/{script,shot-list,cover-spec,publish-meta}.md + data/ |
| 2 | 工友半夜不睡 | 60s | 刘建军 | day-2/… |
| 3 | 小敏失恋 | 90s | 小敏 | day-3/… |
| 4 | 群里炸了 | 75s | 群聊（4 人） | day-4/… |
| 5 | 没接儿子电话 | 60s | 大壮 | day-5/… |
| 6 | 老周说回家吧 | 90s | 老周（情感顶点） | day-6/… |
| 7 | 夜里那个是谁 | 90s | 夜里那个（反转） | day-7/… |

## 共享素材

| 路径 | 内容 | 来源 |
|---|---|---|
| shared-assets/avatars/wang-cuifang.svg | 王翠芳头像 | 本包新增 |
| shared-assets/avatars/liu-jianjun.svg | 刘建军头像 | 本包新增 |
| shared-assets/avatars/xiao-min.svg | 小敏头像 | 本包新增 |
| shared-assets/avatars/lao-zhou.svg | 老周头像 | 本包新增 |
| shared-assets/avatars/li-juan.svg | 李娟头像 | 本包新增 |
| shared-assets/avatars/da-zhuang.svg | 大壮头像 | 本包新增 |
| shared-assets/avatars/ye-li-na-ge.svg | 夜里那个（剪影） | 本包新增 |
| shared-assets/brand/logo.svg | 隐界 logo | 复用抖音包 |
| shared-assets/brand/colors.json | 品牌色源文件 | 复用抖音包 |
| shared-assets/brand/colors.md | 品牌色 Markdown 版 | 复用抖音包 |
| shared-assets/product-screenshots/core-chat.png | 聊天页 UI 参考 | 复用抖音包 |
| shared-assets/product-screenshots/core-feed.png | 视频号 UI 参考 | 复用抖音包 |
| shared-assets/product-screenshots/core-group.png | 群聊 UI 参考 | 复用抖音包 |
| shared-assets/product-screenshots/core-moments.png | 朋友圈 UI 参考 | 复用抖音包 |
| shared-assets/product-screenshots/core-onboarding.png | onboarding UI 参考 | 复用抖音包 |
| shared-assets/product-screenshots/core-self-character.png | 角色编辑页 UI 参考 | 复用抖音包（D7 关键） |
| shared-assets/env-photos/ | 环境照片占位 | Manus 生成（见下方说明） |

## env-photos 待生成清单

Manus 需要在 `shared-assets/env-photos/` 下产出以下环境照片（AI 生成或实拍均可）：

| 文件名 | 用途 | 主要使用 day |
|---|---|---|
| chenmag-room-day.jpg | 老磊出租屋（白天，泡面、单人床） | D2、D3 |
| chenmag-room-night.jpg | 老磊出租屋（夜晚，台灯、阳台、烟灰缸） | D5、D6 |
| chenmag-room-rain.jpg | 出租屋阳台下雨 | D6 |
| factory-night-exterior.jpg | 工厂夜景外景 | D2 |
| factory-smoking-area.jpg | 工厂吸烟区凌晨 3 点 | D2 |
| morning-soup-stand.jpg | 凌晨 5 点早餐铺豆浆机 | D1 |
| ebike-keys-closeup.jpg | 电动车钥匙特写 | D1 |
| safety-helmet-closeup.jpg | 安全帽特写 | D2 |
| cigarette-pack-crumpled.jpg | 皱巴巴的烟盒 | D6 |
| son-certificate.jpg | 儿子的奖状 | D5 |
| street-yam-vendor.jpg | 街边烤红薯摊 | D5 风险缓解（让老磊"心疼自己") |
| mobile-handheld-blurred.jpg | 手抖的手机屏幕特写（D7 钩子） | D7 |

每张建议 1080×1920 或 1920×1080，可裁剪。AI 生成 prompt 见 `00-master-checklist.md`。
