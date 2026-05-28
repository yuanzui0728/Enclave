# 隐界自部署教程：前台 + 后端

本文教你在自己的服务器上跑起来两件东西：

| 服务 | 默认本地端口 | 对应代码 | 角色 |
|------|------|---------|------|
| **主 App（前台）** | 5180 | `apps/app` | 普通用户用的 Web 客户端（朋友圈、聊天、广场、群聊等） |
| **Core API（后端）** | 3000 | `api/` | NestJS 后端，数据存 SQLite；运维能力以 `/admin/*` 接口形式内置 |

> 独立的 `apps/admin` 运维后台**已退役**：运维能力如今以后端 `/admin/*` 接口形式内置（用 `ADMIN_SECRET` 鉴权，请求带 `X-Admin-Secret` 头），自部署直接用脚本 / HTTP 客户端调用即可，开源不再捆绑独立后台前端。官方多租户云另有运维控制台（`apps/cloud-api`、`apps/cloud-console`），与 Wiki 角色平台（`apps/wiki`）一样**不在开源范围**，自部署用不到。

---

## 0. 拓扑

```
                ┌──────────────────────┐
   普通用户 ───▶│  主 App (5180)       │──┐
                │  apps/app + nginx    │  │   /api, /socket.io
                └──────────────────────┘  │   反代到 3000
                                          ▼
                                ┌─────────────────────┐
   运维 / 脚本 ────────────────▶│  Core API (3000)    │
   (/admin/* + X-Admin-Secret)  │  api/ (NestJS)      │
                                │  └─ SQLite 单文件    │
                                └─────────────────────┘
```

要点：

- 前台与运维**共用同一个后端**：普通用户走 App，运维走后端 `/admin/*` 接口
- 后端默认用 SQLite 单文件数据库，没有外部依赖（不需要 Postgres/Redis/MongoDB）
- 运维接口的访问控制靠 `ADMIN_SECRET` 这个共享密钥（请求带 `X-Admin-Secret` 头）

---

## 1. 前置依赖

任选一种部署方式：

**Docker 部署（推荐）**
- Docker 24+
- Docker Compose v2

**裸机部署**
- Node.js 20+
- pnpm 8.15.4（仓库 `packageManager` 锁定的版本，建议 `corepack enable` 自动获取）
- nginx（或任意能跑静态站点 + HTTP 反代的 web server）
- 编译 `better-sqlite3` 需要：python3、make、g++（Linux 装 `build-essential` 即可）

**通用**
- 一把 LLM 网关的 API Key。最便宜的选择是 [DeepSeek](https://platform.deepseek.com/)，也兼容任意 OpenAI 协议网关（OpenAI、火山方舟、阿里通义、N1N 等）

---

## 2. 准备环境变量

```bash
git clone https://github.com/yuanzui0728/enclave.git
cd enclave
cp api/.env.example api/.env
```

打开 `api/.env`，至少填这几项：

```env
# LLM 网关
DEEPSEEK_API_KEY=sk-你的key
OPENAI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat

# 后端 server
PORT=3000
DATABASE_PATH=./data/database.sqlite
ADMIN_SECRET=换成一段长随机串-/admin/* 运维接口鉴权用
JWT_SECRET=换成另一段长随机串
USER_API_KEY_ENCRYPTION_SECRET=换成第三段长随机串

# 允许跨域的前端来源（按你实际域名/端口写，逗号分隔）
CORS_ALLOWED_ORIGINS=http://localhost:5180

# 主 App 对外公开的根地址（不要带 /api）
PUBLIC_API_BASE_URL=http://localhost:3000
```

> **生成随机串小技巧**：`openssl rand -hex 32`

可选项：

- `MINIMAX_API_KEY`：朋友圈/视频号里 NPC 自动生成视频/音乐用，不填就只是这部分功能不可用
- `SMTP_*`：邮箱验证码登录用，不填则验证码会打印到服务端日志（dev mock 模式）

---

## 3. 用 Docker Compose 一键启动（推荐路径）

仓库自带的 `docker-compose.yml` 已经覆盖**主 App + 后端**两件：

```bash
docker compose up -d
```

启动后：

- 主 App：http://localhost（容器内 nginx 反代 `/api`、`/socket.io`、`/health` 到 `api:3000`，外面感觉就是单一域名）
- Core API：http://localhost:3000（直接对外端口；如果你用反代统一入口，可以在 compose 里删掉这个 `ports` 映射）
- SQLite 数据落到宿主机 `./data/database.sqlite`

运维操作直接打后端的 `/admin/*` 接口（带 `X-Admin-Secret` 头），无需再起任何后台前端容器。

---

## 4. 不用 Docker 的裸机部署

如果你倾向手工部署到裸机/VPS，两件分别这么跑：

### 4.1 后端 main-api（端口 3000）

```bash
# 仓库根目录
pnpm install --frozen-lockfile     # workspace 包；api/ 不在 pnpm workspace 内
cd api
npm ci                             # api/ 走 npm + package-lock.json
npm run build                      # 等价 nest build；产物在 api/dist
node dist/main                     # 或者 pm2 start dist/main --name yinjie-api
```

`api/.env` 必须就位（参考第 2 步）。SQLite 数据库会自动建在 `DATABASE_PATH` 指向的位置。

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

### 4.2 主 App（端口 5180）

构建静态产物：

```bash
pnpm --filter @yinjie/app build
# 产物在 apps/app/dist/
```

把 `apps/app/dist/` 交给任何静态服务器。仓库自带的 nginx 模板在 `apps/app/nginx/default.conf.template`，把里面 `${APP_API_UPSTREAM}` 替换成 `http://127.0.0.1:3000`，监听端口改成 5180（或 80），就能直接用：

```bash
sudo cp apps/app/nginx/default.conf.template /etc/nginx/conf.d/yinjie-app.conf
sudo sed -i 's#\${APP_API_UPSTREAM}#http://127.0.0.1:3000#g' /etc/nginx/conf.d/yinjie-app.conf
sudo sed -i 's/listen 80;/listen 5180;/' /etc/nginx/conf.d/yinjie-app.conf
sudo sed -i 's#/usr/share/nginx/html#/绝对路径/到/apps/app/dist#' /etc/nginx/conf.d/yinjie-app.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 4.3 运维接口（`/admin/*`）

运维不再是独立前端，而是后端 `api` 暴露的一组 `/admin/*` 接口。任何 HTTP 客户端带上 `X-Admin-Secret` 头即可调用，例如：

```bash
curl -H "X-Admin-Secret: 你的-ADMIN_SECRET" http://127.0.0.1:3000/api/admin/stats
```

---

## 5. 公网访问 + HTTPS

推荐做法：用一台带证书的 nginx 反代主 App 域名，例如：

```nginx
# 前台
server {
  listen 443 ssl;
  server_name app.your-domain.com;
  ssl_certificate     /path/to/fullchain.pem;
  ssl_certificate_key /path/to/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:5180;   # docker compose 用 80 就改成 80
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

记得把这个域名加进 `api/.env` 的 `CORS_ALLOWED_ORIGINS`，并把 `PUBLIC_API_BASE_URL` 改成主 App 的公网根地址。改完重启 api。

> `/admin/*` 走的是同一个后端。若要从公网调用运维接口，建议额外加一层 IP 白名单或基本认证，避免 `ADMIN_SECRET` 被暴力穷举；并确认反代显式透传 `X-Admin-Secret` 头（`proxy_set_header X-Admin-Secret $http_x_admin_secret;`）。

---

## 6. 验证清单

```bash
# 后端
curl https://app.your-domain.com/health           # 期望 200
curl https://app.your-domain.com/api/world/owner  # 期望 200 + JSON

# 运维接口鉴权（带正确的 secret）
curl -H "X-Admin-Secret: 你的-ADMIN_SECRET" \
  https://app.your-domain.com/api/admin/stats
# 期望 200 + JSON；返回 401 说明 secret 不对或 nginx 没把 X-Admin-Secret 头透传过去
```

打开浏览器：

- 前台：用邮箱（或手机号，看你开了哪个）走一遍注册/登录，进首页能看到聊天/朋友圈

---

## 7. 升级与备份

```bash
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

数据全部在 `./data/database.sqlite`，迁移/备份直接拷这个文件就行（停服 ≤1s 的话热拷也基本安全，严谨做法：`sqlite3 database.sqlite ".backup ./backup-$(date +%F).sqlite"`）。

> **不要清空 `apps/app/dist/assets/`**：前端 chunk 带内容哈希，旧标签页切页面时还会请求历史 chunk，留着可以避免 404。

---

## 8. 常见问题

**Q: 前台报 "Failed to fetch"？**
检查浏览器 devtools → Network。最常见两种：
1. 请求被 SPA 兜底（返回 `text/html`）→ 你的 nginx/vite proxy 没把 `/api` 转给 `:3000`
2. CORS 被拒 → `CORS_ALLOWED_ORIGINS` 没包含你的域名

**Q: `/admin/*` 一直返回 "未授权"？**
确认 nginx 没吞掉 `X-Admin-Secret` 头。某些代理会过滤非标准头，需要在 `proxy_set_header X-Admin-Secret $http_x_admin_secret;` 显式透传。

**Q: WebSocket 报 400？**
`/socket.io/` 的 location 必须显式带 `Upgrade`/`Connection` 头，且 `proxy_http_version 1.1`。漏一个就 400。

**Q: `better-sqlite3` 编译失败？**
缺 build toolchain。Linux：`apt install build-essential python3`；macOS：`xcode-select --install`。

**Q: 我想用 PostgreSQL/MySQL 替代 SQLite？**
当前不支持。后端通过 TypeORM 接 better-sqlite3，切换数据库需要改 `api/src/app.module.ts` 里的 datasource 配置以及若干仓库实现。社区贡献欢迎。

---

## 进一步阅读

- [DEPLOY.md](./DEPLOY.md) — Docker Compose 默认部署、桌面端 Tauri 构建、签名公证
- [README.md](./README.md) — 项目概览、架构、产品形态
- `api/.env.example` — 所有可配置环境变量的注释说明
