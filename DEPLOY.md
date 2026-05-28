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
CORS_ALLOWED_ORIGINS=https://app.your-domain.com
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

如果要部署官方云平台（含运维后台），还需要额外部署：
- `apps/cloud-api/`
- `apps/cloud-console/`（独立的 `apps/admin` 运维后台已退役，能力并入 cloud console）

这些端当前不包含在根 compose 的默认交付里。单世界实例的运维直接走 api 的 `/admin/*` 接口（`ADMIN_SECRET` 鉴权）即可。

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | 是 | 实例默认 Provider 的 API Key |
| `OPENAI_BASE_URL` | 否 | 默认 Provider 的 OpenAI 兼容地址 |
| `AI_MODEL` | 否 | 默认模型 |
| `ADMIN_SECRET` | 是 | `/admin/*` 运维接口鉴权密钥 |
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

### macOS 代码签名 / 公证

`apps/desktop/src-tauri/tauri.conf.json` 中 `signingIdentity` 保持为 `null`，由 env 决定签名形态，三种打包模式：

| 模式 | 触发 | 产物可分发性 |
|------|------|--------------|
| (1) 无签名（本地验证） | 不设 `APPLE_SIGNING_IDENTITY` 或设为 `-`（ad-hoc） | 本地可装，他人机器上 Gatekeeper 拦截 |
| (2) Developer ID 签名，不公证 | 设 `APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (TEAMID)"` | 可分发，但首次启动用户需要在「系统设置 → 隐私与安全性」手动批准 |
| (3) 签名 + 公证（推荐） | 模式 (2) + `APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH`（App Store Connect API Key） | 直分发，Gatekeeper 不报警 |

本地（开发者机器）跑模式 (1) 自检：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
APPLE_SIGNING_IDENTITY=- pnpm desktop:bundle:mac:aarch64
APPLE_SIGNING_IDENTITY=- pnpm desktop:bundle:mac:x86_64
# 产物：dist/macos-bundle/{aarch64,x86_64}-apple-darwin/Yinjie-*.dmg
```

CI（GitHub Actions macos-14 runner）跑模式 (3)，必需的 repo secrets：

| Secret | 必填模式 | 说明 |
|--------|----------|------|
| `APPLE_CERTIFICATE` | (2)(3) | Developer ID Application 证书 `.p12` 的 base64 |
| `APPLE_CERTIFICATE_PASSWORD` | (2)(3) | `.p12` 解锁密码 |
| `APPLE_SIGNING_IDENTITY` | (2)(3) | 形如 `Developer ID Application: Your Company (TEAMID)` |
| `APPLE_API_KEY` | (3) | App Store Connect API Key `.p8` 文件内容 |
| `APPLE_API_ISSUER` | (3) | API Key 对应的 issuer ID (UUID) |
| `APPLE_API_KEY_PATH` | (3) | runner 内 `.p8` 文件存放路径（CI workflow 自动生成） |

触发 CI mac 打包（不上传到 release）：

```bash
gh workflow run desktop-macos-release.yml -f target_mode=both -f upload_to_release=false
```

触发并发布到 release（推 tag）：

```bash
# tag 与 tauri.conf.json 的 version 必须一致
git tag desktop-v0.1.0 && git push origin desktop-v0.1.0
```

审计校验（CI 自动跑，本地也可手动）：

```bash
pnpm --dir apps/desktop audit:desktop-shell        # 全量 = web invoke ↔ Tauri command + capability + 4 lproj
pnpm --dir apps/desktop audit:desktop-shell:static # 不跑 web build，纯静态
cd apps/desktop/src-tauri && cargo fmt --all -- --check  # CI mac gate 包含此条
```

### macOS 打包常见错误排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `iconutil: command not found` | Xcode CLT 未装 | `xcode-select --install` |
| `error: failed to build for target aarch64-apple-darwin` | Rust target 未装 | `rustup target add aarch64-apple-darwin x86_64-apple-darwin` |
| `pkg-config exited with status code 1` | 在 Linux 上误跑 mac 构建 | 必须在 macOS 上跑；本机只能做 audit + cargo fmt 静态校验 |
| `frozen-lockfile: ERR_PNPM_OUTDATED_LOCKFILE` | `pnpm-lock.yaml` 与 `package.json` 不一致 | 本地 `pnpm install` 后重提交 lockfile |
| Gatekeeper "无法打开..." 提示 | 用模式 (1) 出的包分发给他人 | 用模式 (3)；接收方也可右键打开 → 信任 |
| Notarization 超时 | Apple 服务慢 | `xcrun notarytool log <submission-id> --key ...` 看详细，通常 1-15 分钟 |

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
