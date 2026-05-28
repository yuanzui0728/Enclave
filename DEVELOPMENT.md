# 本地开发指南

**简体中文** · [English](DEVELOPMENT.en.md) · [日本語](DEVELOPMENT.ja.md) · [한국어](DEVELOPMENT.ko.md)

> 只想 3 分钟跑起来体验？回到 [README.md](README.md) 的 Docker 一键启动。
> 这份指南面向**贡献者 / 二次开发者**，覆盖源码模式下的启动、停止、重启、端口、Android 联调。

---

## 1. 环境要求

| 项 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 18 | `scripts/dev-services.mjs` 使用 ESM |
| pnpm | 8.15.4 | 已在 `package.json` 的 `packageManager` 字段锁定 |
| 操作系统 | macOS / Linux / Windows（PowerShell 或 Git Bash） | shell 重启脚本需要 bash 环境 |
| Android Studio + JDK 21 | 可选 | 仅 Android 联调需要；`pnpm android:run` 会在系统 Java < 21 时自动下载 |
| Docker | 可选 | 仅当你要对照生产 compose 部署时需要 |

推荐用 corepack 锁定 pnpm 版本：

```bash
corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm -v   # 应输出 8.15.4
```

---

## 2. 一键启动（推荐）

```bash
git clone https://github.com/yuanzui0728/enclave.git && cd enclave
pnpm install                       # workspace 包（apps/* + packages/*）
( cd api && npm install )          # api 自带 npm 锁，不在 pnpm workspace 里，必须单独装
cp api/.env.example api/.env
# 编辑 api/.env：至少填 DEEPSEEK_API_KEY 和 ADMIN_SECRET
pnpm dev:api                       # 后端 NestJS（:3000）
pnpm dev:app                       # 主 App Vite dev（:5180）
```

> 🛠 独立运维后台 `apps/admin` 已退役，能力并入 cloud console；自部署 / 单租户场景直接用 api 暴露的 `/admin/*` 接口（`ADMIN_SECRET` 鉴权）即可，无需单独起后台前端。

> ⚠️ 不要直接跑 `pnpm dev`：这条命令是为多租户云模式准备的（启 app + wiki + cloud-api + cloud-console），**故意不含 api** —— 自部署 / 单租户场景反而需要 api 单独在 :3000 上跑。

`pnpm dev:*` 把进程 detach 到后台，**日志落在 `logs/dev-services/<服务>.{out,err}.log`，不会刷在终端窗口里**。想跟实时日志：

```bash
tail -f logs/dev-services/api.out.log
```

打开：

- 主 App：<http://localhost:5180>
- 后端 API：<http://localhost:3000>（运维接口在 `/admin/*`，用 `ADMIN_SECRET` 鉴权）

---

## 3. 服务与端口

| 服务 | 启动单服务 | 端口 |
|------|------|------|
| 后端 API（NestJS） | `pnpm dev:api` | 3000 |
| 主 App（Vite） | `pnpm dev:app` | 5180 |
| Cloud Console | `pnpm dev:cloud-console` | 5182 |
| Cloud API | `pnpm dev:cloud-api` | 3001 |
| Wiki | `pnpm dev:wiki` | 5184 |
| Site（官网） | `pnpm dev:site` | - |
| Desktop（Tauri） | `pnpm dev:desktop` | - |
| WeChat Connector | `pnpm dev:wechat-connector` | - |

---

## 4. 进程管理：停止 / 重启 / 状态

### 整套
```bash
pnpm dev:stop       # 停止当前 workspace 全部服务
pnpm dev:restart    # 整套重启
pnpm dev:status     # 查看哪些在跑、端口占用
pnpm dev:all        # 启动 workspace + cloud 全套
```

### 单服务（每个服务都有 `:stop` / `:restart` / `:status` 三件套）
```bash
pnpm dev:api:restart
pnpm dev:app:restart
pnpm dev:cloud-api:restart
pnpm dev:cloud-console:restart
pnpm dev:wiki:restart
pnpm dev:site:restart
```

### Shell 单服务重启脚本（仓库根目录）

适合不想记 pnpm script 名的同学，效果等价：

```
./restart-app.sh            # 重启主 App + 同步必要服务
./restart-cloud-api.sh      # 重启 Cloud API
./restart-cloud-console.sh  # 重启 Cloud Console
./restart-wiki.sh           # 重启 Wiki
./restart-site.sh           # 重启官网
./restart-app-only.sh       # 仅重启主 App，不动其它
```

---

## 5. 环境变量（`api/.env`）

**必填**：

- `DEEPSEEK_API_KEY` — DeepSeek 或任意 OpenAI 兼容网关的密钥
- `ADMIN_SECRET` — 随机长串。首次启动用它创建唯一管理员（"世界主人"单例）

**常用可选**：

- `OPENAI_BASE_URL`（默认 `https://api.deepseek.com`）
- `AI_MODEL`（默认 `deepseek-chat`）
- `JWT_SECRET`（开发期可留默认）
- `PORT`（默认 3000）
- `DATABASE_PATH`（默认 `./data/database.sqlite`）
- `PUBLIC_API_BASE_URL` — 同域部署时写公开 Web 根地址（如 `https://app.your-domain.com`），**不要带 `/api`**
- `CORS_ALLOWED_ORIGINS` — 默认已包含 `localhost:5180/5182` 等
- `SMTP_*` / `MAIL_FROM_ADDRESS` — 配齐则发送邮箱验证码；不配，验证码会**打印到 API 日志**，方便本地开发
- `USER_API_KEY_ENCRYPTION_SECRET` — 用户自带密钥加密所需

完整清单见 `api/.env.example`。

---

## 6. 数据库

- 引擎：SQLite（`better-sqlite3`）
- 默认路径：仓库根目录的 `data/database.sqlite`
- 启动时 TypeORM `synchronize: true`，**无需手动迁移**
- 首次启动自动：seed 默认角色 → AI 关系初始化 → 单 owner 迁移
- 旧路径（`api/database.sqlite` / `api/data/database.sqlite`）会自动搬到新路径

想从零再来：直接删 `data/database.sqlite` 后重启 api。

---

## 7. Android 本地联调

```bash
# 用任意 API（默认指向你 .env 里的 PUBLIC_API_BASE_URL）
pnpm android:run

# 同时拉本地 API（127.0.0.1:39092）+ 把模拟器指到 10.0.2.2:39092
pnpm android:run:local

# 或直接：
./start-android-emulator.sh
```

`pnpm android:run` 会自动：补 `ANDROID_SDK_ROOT` → 必要时下载 JDK 21 → 连接已开的模拟器（或启第一个可用 AVD）→ build Web 包 → Capacitor sync → 装 Debug APK → 拉起 App。

辅助命令：`pnpm android:doctor`（环境体检）、`pnpm android:open`（在 Android Studio 打开）、`pnpm android:apk` / `android:bundle`（出包）。

---

## 8. 健康检查（部署排查）

```bash
curl http://localhost:3000/health      # 单独跑 api 时
curl http://localhost/healthz          # Docker compose 走 web 反代时
```

---

## 9. 常见问题

- **端口被占用**：`pnpm dev:status` 看是不是上次的进程没退干净 → `pnpm dev:stop` 再 `pnpm dev`
- **pnpm install 慢**：换镜像 `pnpm config set registry https://registry.npmmirror.com`
- **DeepSeek key 还没办？**：`OPENAI_BASE_URL` + `AI_MODEL` 改成任意 OpenAI 兼容网关，`DEEPSEEK_API_KEY` 填那里发的 key
- **不想跑 cloud 套件**：用 `pnpm dev` 即可（workspace 默认不含 cloud）；`pnpm dev:all` 才会拉 cloud

---

## 10. 更多文档

- [README.md](README.md) — 产品介绍 / Docker 3 分钟启动
- [DEPLOY.md](DEPLOY.md) — 完整生产部署
- [CONTRIBUTING.md](CONTRIBUTING.md) — 贡献规范
- [ROADMAP.md](ROADMAP.md) — 路线图
