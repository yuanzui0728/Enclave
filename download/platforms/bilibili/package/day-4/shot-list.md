# Day 4 镜头清单

**总时长目标**：6:30-7:30

> 这是教程集，节奏比其他集慢，每个命令必须**明确停留**让观众看清。

---

## 镜头 001 · 系列片头

- 00:00-00:02，「Day 4 / 7」

---

## 镜头 002 · 钩子 - 命令快速打字

- **时间**：00:02-00:12（10 秒）
- **类型**：🎨 GENERATE + 动效
- **提示词**：
  ```
  Terminal window with rapid typewriter animation typing three commands:
  "git clone ...", "docker compose up -d", "open http://localhost".
  Green text on pure black, hacker aesthetic. Top corner shows stopwatch
  counting down from 10:00 to 00:00
  ```
- **屏上字幕**：「10 分钟 · 3 条命令 · 1 把 API Key」
- **转场**：硬切

---

## 镜头 003 · 钩子收束 - app 启动

- **时间**：00:12-00:20（8 秒）
- **类型**：🖼️ EXISTING + 转场
- **素材**：`shared-assets/gifs/yinjie-core-loop.gif`（截前 5 秒）
- **屏上字幕**：「一群有性格的 AI 居民 / 全部在你硬盘里」

---

## 镜头 004 · 章节卡 - 准备

- 00:20-00:21
- 字幕：「01 · 你需要准备什么」

---

## 镜头 005 · 准备三件套

- **时间**：00:21-01:00（39 秒）
- **类型**：🎨 GENERATE
- **提示词**：
  ```
  Three items laid out in a flat-lay infographic style:
  1. Docker icon (whale logo) with "Docker Desktop" label
  2. Key icon with "DeepSeek API Key" label and small text "platform.deepseek.com"
  3. Small server icon with "2C2G machine" label
  Connected by dashed lines to a central "Enclave" logo. Clean, dark background
  ```
- **屏上字幕**：「① Docker」「② DeepSeek API Key」「③ 2 核 2G 机器」

---

## 镜头 006 · 章节卡 - 步骤 1

- 01:00-01:01
- 字幕：「02 · 第一条命令：克隆」

---

## 镜头 007 · 终端实操：clone

- **时间**：01:01-01:30（29 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：实机录制终端操作——`git clone ...`、`cd enclave`、`ls`，1080p，字体 ≥ 24pt
- **屏上字幕**（同时显示命令字幕，复制命令方便观众抄）：
  - `git clone https://github.com/yuanzui0728/enclave.git`
  - `cd enclave`

---

## 镜头 008 · 终端实操：cp env

- **时间**：01:30-01:50（20 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：`cp api/.env.example api/.env`，然后用 nano/vim 打开 .env，圈出 DEEPSEEK_API_KEY 和 ADMIN_SECRET 两行
- **屏上字幕**：`cp api/.env.example api/.env` 然后「填入 DEEPSEEK_API_KEY」+「随便填 ADMIN_SECRET」

---

## 镜头 009 · 章节卡 - 步骤 2

- 01:50-01:51
- 字幕：「03 · 第二条命令：起服务」

---

## 镜头 010 · 终端实操：docker compose up

- **时间**：01:51-02:30（39 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：执行 `docker compose up -d`，画面 2 倍加速过镜像下载（角落加"已加速 2x"标识），加速结束后回到原速
- **屏上字幕**：`docker compose up -d` 然后「-d = 后台运行 / 首次约 1-2 分钟」

---

## 镜头 011 · docker compose ps

- **时间**：02:30-03:00（30 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：`docker compose ps` 输出，确认 4 个容器 Up
- **屏上字幕**：「api / app / admin / nginx 全部 Up ✓」

---

## 镜头 012 · docker stats

- **时间**：03:00-03:30（30 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：`docker stats --no-stream`，画面上方加注释箭头指向 CPU 和 MEM 列
- **屏上字幕**：「CPU 0% / 内存 350MB / 2C2G 够用」

---

## 镜头 013 · 章节卡 - 步骤 3

- 03:30-03:31
- 字幕：「04 · 第三条命令：打开浏览器」

---

## 镜头 014 · 浏览器打开 localhost

- **时间**：03:31-04:00（29 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：浏览器输入 localhost，回车，首次访问的"单例迁移"加载页 → 进入主界面
- **素材兜底**：`shared-assets/product-screenshots/core-onboarding.png`
- **屏上字幕**：「http://localhost」「首次会跑单例迁移」

---

## 镜头 015 · 5 幕入场动画

- **时间**：04:00-04:45（45 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：5 幕入场动画的实机录制
- **屏上字幕**：「5 幕入场 / 5 个角色依次亮相」

---

## 镜头 016 · 摇一摇加好友

- **时间**：04:45-05:15（30 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：摇一摇 → 随机出一个角色 → 看到他的"申请加好友"文案 → 同意
- **屏上字幕**：「摇一摇 / 随机发现新角色 / 文案是 AI 自己写的」

---

## 镜头 017 · 第一段对话

- **时间**：05:15-05:30（15 秒）
- **类型**：📹 SCREEN-CAP-NEEDED
- **录屏要求**：刚加的角色发一条消息，等他回复
- **屏上字幕**：「你和他的第一段对话」

---

## 镜头 018 · 章节卡 - FAQ

- 05:30-05:31
- 字幕：「05 · 三个常见问题」

---

## 镜头 019 · Q1: 换 OpenAI/Ollama

- **时间**：05:31-06:00（29 秒）
- **类型**：🎨 GENERATE
- **提示词**：
  ```
  Code editor showing .env file with three highlighted lines:
  OPENAI_BASE_URL=https://api.openai.com/v1
  OPENAI_API_KEY=sk-xxx
  OPENAI_MODEL=gpt-4o
  Alternative version below showing Ollama:
  OPENAI_BASE_URL=http://host.docker.internal:11434/v1
  Modern code editor look, syntax highlighting
  ```
- **屏上字幕**：「Q1 换模型？改 .env 即可 / 改 base URL 就行」

---

## 镜头 020 · Q2: 数据安全

- **时间**：06:00-06:20（20 秒）
- **类型**：🎨 GENERATE
- **提示词**：
  ```
  File explorer view showing "data/cloud-platform.sqlite" file highlighted,
  with a padlock icon overlay and label "Everything is local".
  No cloud/upload arrows. Dark UI
  ```
- **屏上字幕**：「Q2 数据上传？/ 不会 / 全在 ./data/ 一个文件里」

---

## 镜头 021 · Q3: 远程访问

- **时间**：06:20-06:40（20 秒）
- **类型**：🎨 GENERATE
- **提示词**：
  ```
  Network diagram: localhost machine connected to public internet via
  three options: frp, cloudflare tunnel, oray vicp.fun. Each as a small
  icon with label. Arrow shows traffic flow
  ```
- **屏上字幕**：「Q3 公网访问？/ frp / Cloudflare Tunnel / 花生壳」

---

## 镜头 022 · 下集预告

- **时间**：06:40-07:00（20 秒）
- **类型**：🎨 GENERATE
- **提示词**：
  ```
  Silhouette of a solo developer at desk late night, soft amber lighting,
  emotional cinematic mood, philosophical aesthetic
  ```
- **屏上字幕**：「明天 Day 5」「不讲技术，讲我为什么做这件事」

---

## 镜头 023 · 系列片尾

- 07:00-07:03
- CTA + 「Day 4 / 7」+「下一集：为什么做这件事」

---

## 关键提示给 manus

教程集和其他集最大区别——
1. **所有命令必须以字幕形式同时出现在屏幕上**（即使旁白已念过），便于观众抄写
2. **命令出现时镜头停留 ≥ 4 秒**，给观众抄的时间
3. **加速段必须明确标识"已加速 2x"**，不要假装"我电脑很快"
4. **错误提示也保留**——如果录屏过程中遇到错误，不要剪掉，告诉观众"如果你看到这个错误，是 XX 原因，修复方法是 XX"
