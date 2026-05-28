# Local Development Guide

[简体中文](DEVELOPMENT.md) · **English** · [日本語](DEVELOPMENT.ja.md) · [한국어](DEVELOPMENT.ko.md)

> Just want to try Enclave in 3 minutes? Go back to [README.en.md](README.en.md) — Docker one-liner.
> This guide is for **contributors / from-source developers**: how to start, stop, restart, and run the Android shell.

---

## 1. Prerequisites

| Item | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | `scripts/dev-services.mjs` is ESM |
| pnpm | 8.15.4 | pinned by `packageManager` in `package.json` |
| OS | macOS / Linux / Windows (PowerShell or Git Bash) | shell restart scripts need bash |
| Android Studio + JDK 21 | optional | only for Android shell; `pnpm android:run` auto-downloads JDK 21 if your system Java is older |
| Docker | optional | only if you want to mirror the production compose locally |

Recommended: pin pnpm via corepack:

```bash
corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm -v   # should print 8.15.4
```

---

## 2. One-command start (recommended)

```bash
git clone https://github.com/yuanzui0728/enclave.git && cd enclave
pnpm install                       # workspace packages (apps/* + packages/*)
( cd api && npm install )          # api ships its own npm lock and isn't a pnpm workspace member
cp api/.env.example api/.env
# Edit api/.env — at minimum set DEEPSEEK_API_KEY and ADMIN_SECRET
pnpm dev:api                       # NestJS backend (:3000)
pnpm dev:app                       # main app Vite dev (:5180)
```

> 🛠 The standalone `apps/admin` ops console has been retired and folded into the cloud console; for self-hosted / single-tenant setups just hit the backend's `/admin/*` API (authenticated with `ADMIN_SECRET`) — no separate admin frontend needed.

> ⚠️ Don't just run `pnpm dev` here: that command targets the multi-tenant cloud flow (it starts app + wiki + cloud-api + cloud-console) and **deliberately excludes api** — for self-hosted / single-tenant dev you need api running on :3000 directly.

`pnpm dev:*` detaches each service to the background, and **logs land in `logs/dev-services/<service>.{out,err}.log` — they are not streamed to your terminal**. To tail them live:

```bash
tail -f logs/dev-services/api.out.log
```

Open:

- Main app: <http://localhost:5180>
- Backend API: <http://localhost:3000> (ops endpoints under `/admin/*`, authenticated with `ADMIN_SECRET`)

---

## 3. Services & ports

| Service | Start individually | Port |
|------|------|------|
| Backend API (NestJS) | `pnpm dev:api` | 3000 |
| Main App (Vite) | `pnpm dev:app` | 5180 |
| Cloud Console | `pnpm dev:cloud-console` | 5182 |
| Cloud API | `pnpm dev:cloud-api` | 3001 |
| Wiki | `pnpm dev:wiki` | 5184 |
| Site | `pnpm dev:site` | - |
| Desktop (Tauri) | `pnpm dev:desktop` | - |
| WeChat Connector | `pnpm dev:wechat-connector` | - |

---

## 4. Process control: stop / restart / status

### Whole workspace
```bash
pnpm dev:stop       # stop everything in current workspace
pnpm dev:restart    # restart all
pnpm dev:status     # see what's running and which ports are taken
pnpm dev:all        # workspace + cloud combined
```

### Per service (every service has `:stop` / `:restart` / `:status`)
```bash
pnpm dev:api:restart
pnpm dev:app:restart
pnpm dev:cloud-api:restart
pnpm dev:cloud-console:restart
pnpm dev:wiki:restart
pnpm dev:site:restart
```

### Shell restart scripts (in repo root)

Equivalent to the pnpm scripts above, handier if you live in a terminal:

```
./restart-app.sh            # restart Main App + required deps
./restart-cloud-api.sh      # restart Cloud API
./restart-cloud-console.sh  # restart Cloud Console
./restart-wiki.sh           # restart Wiki
./restart-site.sh           # restart Site
./restart-app-only.sh       # restart Main App only, leave others alone
```

---

## 5. Environment variables (`api/.env`)

**Required**:

- `DEEPSEEK_API_KEY` — DeepSeek (or any OpenAI-compatible gateway) API key
- `ADMIN_SECRET` — long random string. First boot uses it to create the single world owner

**Common optional**:

- `OPENAI_BASE_URL` (default `https://api.deepseek.com`)
- `AI_MODEL` (default `deepseek-chat`)
- `JWT_SECRET` (leave default for dev)
- `PORT` (default 3000)
- `DATABASE_PATH` (default `./data/database.sqlite`)
- `PUBLIC_API_BASE_URL` — for single-domain deploys, set to your public web root (e.g. `https://app.your-domain.com`). **No `/api` suffix.**
- `CORS_ALLOWED_ORIGINS` — defaults already cover `localhost:5180/5182`
- `SMTP_*` / `MAIL_FROM_ADDRESS` — fill these to send email codes; leave blank and codes get **printed to the API log** (handy for local dev)
- `USER_API_KEY_ENCRYPTION_SECRET` — needed for user-supplied API key encryption

Full list: `api/.env.example`.

---

## 6. Database

- Engine: SQLite (`better-sqlite3`)
- Default path: `data/database.sqlite` at repo root
- TypeORM `synchronize: true` on boot — **no manual migration**
- First boot automatically: seeds default characters → bootstraps AI relationships → runs single-owner migration
- Old paths (`api/database.sqlite` / `api/data/database.sqlite`) are auto-moved to the new path

Wipe and start over: just delete `data/database.sqlite` and restart api.

---

## 7. Android local dev

```bash
# Use whatever API your .env PUBLIC_API_BASE_URL points to
pnpm android:run

# Spin up a local API (127.0.0.1:39092) + wire the emulator to 10.0.2.2:39092
pnpm android:run:local

# Or directly:
./start-android-emulator.sh
```

`pnpm android:run` auto: fills `ANDROID_SDK_ROOT` → downloads JDK 21 if needed → connects to a running emulator (or boots the first available AVD) → builds the web bundle → Capacitor sync → installs Debug APK → launches the app.

Helpers: `pnpm android:doctor` (env check), `pnpm android:open` (open in Android Studio), `pnpm android:apk` / `android:bundle` (build artifacts).

---

## 8. Health check

```bash
curl http://localhost:3000/health      # api standalone
curl http://localhost/healthz          # behind the docker-compose web reverse proxy
```

---

## 9. Troubleshooting

- **Port already in use**: `pnpm dev:status` — most likely a leftover process. Run `pnpm dev:stop` then `pnpm dev`.
- **`pnpm install` slow**: try `pnpm config set registry https://registry.npmmirror.com`.
- **No DeepSeek key yet**: point `OPENAI_BASE_URL` + `AI_MODEL` at any OpenAI-compatible gateway and put that gateway's key in `DEEPSEEK_API_KEY`.
- **Don't want the cloud suite**: stick with `pnpm dev` (default workspace excludes cloud). `pnpm dev:all` is the one that pulls cloud in.

---

## 10. More docs

- [README.en.md](README.en.md) — Product overview / 3-minute Docker launch
- [DEPLOY.md](DEPLOY.md) — Full production deployment
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guide
