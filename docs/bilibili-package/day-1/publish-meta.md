# Day 1 B 站发布元数据

> 输出文件：`output/day-1/publish-meta.txt`（manus 把以下内容按 `KEY: VALUE` 格式整理一份）
> + `output/day-1/pinned-comment.txt`（置顶评论单独一份）

---

## 标题

**主选**：
> 我用半年时间，给自己造了一个 AI 微信——里面所有人都是 AI，但他们会主动找我

字符数：47（中文）/ 67（含符号），在 B 站 80 字符限制内。

**备选**（如果主选审核被打回）：
> 我做了一个开源的 AI 社交 App，里面的角色会主动发朋友圈

字符数：30。

---

## 分区

- **主分区**：科技 → 数码
- **辅分区**：知识 → 科学科普

---

## 简介（视频下方描述区）

```
开源 AI 社交平台 Enclave / 隐界 —— 自部署、一人一世界、MIT 协议。

【7 天系列 Day 1 / 7】
这是 7 天系列的第一集，明天讲"让 AI 互相评论朋友圈会发生什么"，关注追更不迷路。

🌐 共享体验世界：1gw06751dd053.vicp.fun（仅供感受形态）
💻 GitHub 源码：github.com/yuanzui0728/enclave
📮 联系作者：yuanzui0728@gmail.com

技术栈：NestJS + React 19 + Tauri + Capacitor，TypeScript 全栈，DeepSeek 默认模型（任意 OpenAI 兼容网关都行）。

第一弹幕送给 Day 1，欢迎在评论区聊聊你对"AI 主动社交"的看法。

#开源 #AI #自部署 #Character.AI #独立开发 #DeepSeek #Docker
```

---

## 标签（B 站标签，共 10 个）

```
开源
人工智能
独立开发
Character.AI
DeepSeek
自部署
Docker
AI社交
副业项目
原创
```

⚠️ "原创"标签**必选**——B 站会给原创内容额外推荐流量。
⚠️ 不要使用"教程"标签（Day 1 不是教程）。

---

## 投稿设置

| 项 | 值 | 说明 |
|---|---|---|
| 是否原创 | ✅ 是 | 这是 UP 自制内容 |
| 是否允许转载 | ❌ 否 | 限制转载，提高原创权重 |
| 是否参与活动 | （查询当时活动） | 如果有"开源项目"/"独立开发"/"AI"相关活动，参与 |
| 评论权限 | 全部用户可评论 | 默认 |
| 弹幕权限 | 全部用户可发 | 默认 |
| 付费模式 | 免费 | 不开会员专享 |
| 定时发布 | 取决于 UP 主选择的发布日 19:00 | 见 `00-publish-schedule.md` |

---

## 置顶评论

```
GitHub 仓库 → github.com/yuanzui0728/enclave 欢迎 star 一下追更下一集；想直接试不想自己部署的话，简介里有共享体验链接（注意是共享世界，仅感受产品形态）。

明天 Day 2 讲"让 6 个 AI 互相评论朋友圈会发生什么"，关注追更。
```

发布步骤：
1. 视频上线后 1 分钟内，UP 主在评论区**用自己的账号**发上面这条评论
2. 长按评论 → 置顶
3. 不要用小号刷置顶——B 站可识别同 IP 同设备

---

## 首弹幕（UP 主自己发，发布后 5 分钟内）

发送时间码：**00:08**
内容：「AI 主动发朋友圈？这个我得看看」

⚠️ 这条弹幕的作用是激活弹幕区。B 站算法判定"0 弹幕"视频为低质量，超过 3 条弹幕才进入正式推荐。

---

## 跨平台同步文案（manus 可选生成）

### V2EX

在 [`/home/ps/.claude/plans/7-v2ex-vectorized-brook.md` 中 Day 1 的帖子] 的回复区追加一条：

```
补一个视频版本，刚上传到 B 站：
[B 站视频链接]

视频里有实际朋友圈/聊天/群聊的演示，文字版讲不清楚的那部分可以直接看视觉效果。
```

### X / Twitter（300 字符内）

```
Built an open-source AI social app called Enclave over 6 months.

It's not just a chatbot — characters live in their own social world: post moments, react to each other, run group chats. You own the entire world.

Day 1 of a 7-day Bilibili series:
[B 站视频链接]

GitHub: github.com/yuanzui0728/enclave
```

### 小红书

```
我做了 6 个月，搞出来一个【开源 AI 社交 App】

打开它你看到的是微信壳子，但里面所有人都是 AI——
👥 他们会主动给你发朋友圈
🎬 他们会拍视频号
💬 他们会在群里互相讨论
🌃 他们有作息——半夜找不到人

最关键的：一人一世界，数据全在你自己机器上。

B 站搜「隐界 Day 1」可以看 5 分钟演示视频。

GitHub: yuanzui0728/enclave（MIT 开源）

# AI # 开源 # 独立开发 # Character.AI 替代
```

### 微博（140 字符）

```
做了个开源的 AI 社交 App，里面所有"好友"都是 AI——他们会自己发朋友圈、拍视频、拉群聊。一人一世界，数据在你自己机器上。B 站今天上 Day 1，搜【隐界】或访问 github.com/yuanzui0728/enclave
```

---

## 输出格式（manus 最终要交付的）

```
output/day-1/
├── video.mp4
├── cover.jpg
├── publish-meta.txt          ← 把上面所有"标题/分区/简介/标签/投稿设置"整理成一份
├── pinned-comment.txt        ← 仅置顶评论那一段
└── cross-platform/           ← 可选
    ├── v2ex.txt
    ├── twitter.txt
    ├── redbook.txt
    └── weibo.txt
```
