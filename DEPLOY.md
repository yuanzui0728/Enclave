# 隐界部署指南

## 架构说明

- 每个世界实例都是一个单用户世界，默认数据库使用 SQLite
- iOS、Android、Windows、macOS、Web 全部作为远程客户端接入
- 客户端只需要填写服务端地址，不在本地启动 Core API
- 世界主人可选配置自己的 API Key，服务端仅保存加密后的密文
- 官方云平台当前负责手机号验证、申请单、世界记录与地址回填
- 官方云平台当前不负责自动创建、调度、销毁每个用户的世界实例

## 快速部署世界实例

### 1. 克隆仓库

```bash
git clone https://github.com/yuanzui0728/enclave.git
cd enclave
```

### 2. 配置环境变量

```bash
cp api/.env.example api/.env
```

至少需要配置：

```env
DEEPSEEK_API_KEY=sk-xxxxx
OPENAI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
ADMIN_SECRET=replace-with-a-long-random-secret
DATABASE_PATH=/app/data/database.sqlite
CORS_ALLOWED_ORIGINS=https://app.your-domain.com,https://admin.your-domain.com
PUBLIC_API_BASE_URL=https://app.your-domain.com
USER_API_KEY_ENCRYPTION_SECRET=replace-with-a-second-long-random-secret
```

如果你打算把 Web 客户端和 Core API 放在同一个公开域名下，`PUBLIC_API_BASE_URL` 应填写这个公开站点根地址，不要带 `/api`。

### 3. 启动世界实例

```bash
docker compose up -d
```

默认会一起启动：
- `web`：生产静态前端，默认暴露 `${APP_PORT:-80}`
- `api`：Core API，默认暴露 `${PORT:-3000}`

如果你只想单独启动后端：

```bash
docker compose up -d api
```

### 4. 验证服务

```bash
curl http://localhost/healthz
curl http://localhost/health
```

## 单用户世界迁移

服务端启动时会自动执行单例迁移：
- 旧库 `0` 个用户：自动创建占位世界主人
- 旧库 `1` 个用户：直接沿用
- 旧库多个用户：保留 `createdAt` 最早的用户作为世界主人
- 其余用户及其专属数据会被清理，不做自动合并

## 反向代理

推荐把公开域名直接反向代理到根 compose 的 `web` 服务，例如 `https://app.your-domain.com`。`web` 容器已经会把 `/api`、`/health`、`/socket.io` 转发给内部 `api:3000`，宿主机代理不需要再单独拆 API 路由。

```nginx
server {
    listen 443 ssl;
    server_name app.your-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 客户端接入

所有客户端流程一致：
1. 首次启动进入 `Setup`
2. 选择云世界或本地世界
3. 本地世界：填写实例地址
4. 云世界：通过手机号验证并获取已开通世界地址
5. 若世界主人尚未初始化，则进入 `Onboarding`
6. 进入聊天、社交和内容流

适用端：
- iOS
- Android
- Windows
- macOS
- Web

## 世界主人专属 API Key

世界主人可在 App 的个人设置中配置自己的 API Key 和可选 Base URL。

行为规则：
- 未配置个人 Key 时，走实例默认 Provider
- 配置个人 Key 后，仅该世界主人的请求使用该 Key
- 清除个人 Key 后，立即回退到实例默认 Provider
- 任何读取接口都不会返回 Key 明文

接口：

```http
GET /api/world/owner
PATCH /api/world/owner
PATCH /api/world/owner/api-key
DELETE /api/world/owner/api-key
```

## 云平台部署说明

当前根目录 `docker-compose.yml` 默认交付世界实例 `web + api`。

如果要部署官方云平台，还需要额外部署：
- `apps/cloud-api/`
- `apps/cloud-console/`

如果要部署实例管理后台，还需要额外部署：
- `apps/admin/`

这些端当前不包含在根 compose 的默认交付里。

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | 是 | 实例默认 Provider 的 API Key |
| `OPENAI_BASE_URL` | 否 | 默认 Provider 的 OpenAI 兼容地址 |
| `AI_MODEL` | 否 | 默认模型 |
| `ADMIN_SECRET` | 是 | 管理后台鉴权密钥 |
| `PORT` | 否 | 服务端端口，默认 `3000` |
| `DATABASE_PATH` | 否 | SQLite 文件路径 |
| `CORS_ALLOWED_ORIGINS` | 建议 | 允许访问的客户端域名，逗号分隔 |
| `PUBLIC_API_BASE_URL` | 建议 | 对外公开访问的 Web 根地址，例如 `https://app.your-domain.com` |
| `USER_API_KEY_ENCRYPTION_SECRET` | 强烈建议 | 世界主人专属 API Key 的加密密钥 |

根 compose 额外支持：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `APP_PORT` | 否 | Web 服务映射到宿主机的端口，默认 `80` |

## 桌面端构建（Tauri）

桌面壳位于 `apps/desktop/`，使用 Tauri 2，前端复用 `apps/app` 的构建产物。运行时为远程模式：壳本身不启动 Core API，仅加载远程世界地址，因此不需要额外部署后端依赖。

### Windows 构建

任意装有 Rust + Node 的机器上：

```bash
pnpm --dir apps/desktop build:windows:x64
```

产物位于 `apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`。

### macOS 构建

需要在 macOS 上执行（Apple Silicon 或 Intel 都行，必要时跨 Rust target）：

依赖：

- Xcode Command Line Tools（`xcode-select --install`，需要 `iconutil` 在 PATH 上）
- Rust target：`rustup target add aarch64-apple-darwin x86_64-apple-darwin`

构建命令：

```bash
# Apple Silicon
pnpm --dir apps/desktop build:mac:aarch64

# Intel
pnpm --dir apps/desktop build:mac:x86_64
```

产物位于 `apps/desktop/src-tauri/target/{aarch64-apple-darwin,x86_64-apple-darwin}/release/bundle/`，包括 `.app` 与 `.dmg`。

### macOS 代码签名 / 公证（TODO）

当前 `apps/desktop/src-tauri/tauri.conf.json` 中 `signingIdentity` 与 `providerShortName` 都是 `null`，构建出来的 `.app/.dmg` 是**未签名**的，分发到他人 macOS 上会被 Gatekeeper 拦截，需要用户手动绕过。要做正式分发须先取得 Apple Developer 账号。可选三种接入方式：

1. **直接写入 conf**（最简单，但泄露团队 ID 风险）：把 `signingIdentity` 改为 `"Developer ID Application: Your Company (TEAMID)"`，`providerShortName` 改为团队短名。
2. **环境变量注入**（推荐 CI）：保持 conf 中为 `null`，在 `apps/desktop/scripts/run-tauri.mjs` 里读取 `APPLE_SIGNING_IDENTITY` / `APPLE_PROVIDER_SHORT_NAME`，构建时通过 `--config` 临时覆盖。
3. **CI secret**：把签名身份与 App-specific password 存入 CI 密钥库（`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`），构建后用 `xcrun notarytool submit` 提交公证。

签名/公证落地前，桌面 macOS 包仍是**内部测试用**。审计校验脚本：

```bash
pnpm --dir apps/desktop audit:desktop-shell        # 全量
pnpm --dir apps/desktop audit:desktop-shell:text-only  # 仅校验 4 语种翻译表完整性
```

## 升级

```bash
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

默认数据库位于 `./data/database.sqlite`，升级不会自动清空数据。
如果旧环境曾把数据库写到 `api/database.sqlite` 或 `api/data/database.sqlite`，新版本启动时会自动迁移到 `./data/database.sqlite`。

Web 客户端升级时不要额外删除旧的 `apps/app/dist/assets`。前端懒加载 chunk 带内容哈希，保留旧文件可以避免已打开的旧标签页在切页面时请求到不存在的历史 chunk 并出现 404。
