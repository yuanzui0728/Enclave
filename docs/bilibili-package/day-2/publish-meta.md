# Day 2 B 站发布元数据

---

## 标题

**主选**：
> 我让 6 个 AI 角色在同一条朋友圈下面互相评论，他们差点打起来

字符数：38（中文）/ 51（含符号）。

**备选**（如主选打回）：
> 实测：让 6 个 AI 互相评论我的朋友圈，结果失控了

---

## 分区

- **主分区**：知识 → 科学科普
- **辅分区**：科技 → 数码

---

## 简介

```
6 个 AI 角色，5 种关系（朋友/对手/导师/恋人/熟人），他们的评论是自发生成的，我没有写一句 prompt。

【7 天系列 Day 2 / 7】
昨天 Day 1 讲"我给自己造了一个 AI 微信"，明天 Day 3 讲"AI 居民的作息表设计——为什么半夜找他他可能不理你"。

🌐 自己试试：1gw06751dd053.vicp.fun
💻 GitHub：github.com/yuanzui0728/enclave

技术细节：每个 AI 之间存有"关系类型 + 强度 + 关系前史"，A 看到 B 的评论时，prompt 拼装会带入这段关系数据。代码在 api/src/modules/social/。

第一条弹幕送给这一集的"对手关系"段。

#人工智能 #AI #开源 #Character.AI #社交模拟
```

---

## 标签（10 个）

```
人工智能
AI
开源
Character.AI
社交模拟
关系网
独立开发
DeepSeek
AI实验
原创
```

---

## 投稿设置

| 项 | 值 |
|---|---|
| 是否原创 | ✅ 是 |
| 是否允许转载 | ❌ 否 |
| 评论权限 | 全部用户 |
| 弹幕权限 | 全部用户 |
| 付费模式 | 免费 |
| 发布时间 | Day 2 当天 19:00 |

---

## 置顶评论

```
有弹幕问关系网怎么实现的——简单说：每个 AI 之间存有一段"关系类型 + 强度 + 关系前史"，A 看到 B 的评论时，prompt 里会拼上"你和 B 是 XX 关系，前史 XX"。下一集 Day 3 还会展开"作息表"这一层。

完整代码在 GitHub：github.com/yuanzui0728/enclave
对应模块：api/src/modules/social/
```

---

## 首弹幕（UP 主自己发，发布后 5 分钟内）

- 时间码：**01:15**
- 内容：「对手关系那一段绝了」

---

## 跨平台同步

### V2EX

回到 V2EX 那条 Day 1 帖子的回帖区，追加：

```
更新一下 Day 2 视频版（这次的内容文字版没写过，纯视频独家）：
[B 站视频链接]

简单概括：让 6 个 AI 在我同一条朋友圈底下评论，老马（理性派）和陆铭（对手）开始互怼。原理是关系网注入 prompt。
```

### X

```
Day 2 of my Enclave open-source AI social platform series:

Posted a moment, didn't prompt anyone, and 6 AI characters started arguing
in the comments. Including two with a "rival" relationship who actually
went at each other.

The trick: each pair of AIs has a relationship type + strength + backstory
baked into their prompt.

GitHub: github.com/yuanzui0728/enclave
```

### 小红书

```
让 6 个 AI 在我朋友圈底下互相评论会怎样？

结果——
🤔 理性派：转行 = 放弃复利
💕 共情派：要不要聊聊
🎭 文艺派：哭着吃了一碗面
💢 对手出现：你们说得轻巧

然后理性派和对手开始对喷……
我没让他们说话，他们自己看到对方评论决定接话。

原理：每两个 AI 之间有"关系网"数据，注入 prompt 里。

B 站搜【隐界 Day 2】看完整视频。
```

### 微博

```
让 6 个 AI 在我同一条朋友圈底下评论，结果其中两个对手关系的 AI 开始互怼。整个过程我一句话没说，他们各自看到对方评论后自己接的话。原理：关系网注入 prompt。完整视频 B 站【隐界 Day 2】，开源仓库 github.com/yuanzui0728/enclave
```
