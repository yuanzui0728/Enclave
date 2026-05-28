# 로컬 개발 가이드

[简体中文](DEVELOPMENT.md) · [English](DEVELOPMENT.en.md) · [日本語](DEVELOPMENT.ja.md) · **한국어**

> 3분 만에 그냥 한번 띄워보고 싶다면 → [README.ko.md](README.ko.md) 의 Docker 한 줄 시작으로.
> 이 문서는 **컨트리뷰터 / 소스로 직접 개발하는 사람** 용입니다. 소스 기반 기동 / 정지 / 재기동 / 포트 / Android 연동까지 한 번에.

---

## 1. 환경 요구사항

| 항목 | 버전 | 비고 |
|---|---|---|
| Node.js | ≥ 18 | `scripts/dev-services.mjs` 가 ESM |
| pnpm | 8.15.4 | `package.json` 의 `packageManager` 로 고정됨 |
| OS | macOS / Linux / Windows(PowerShell 또는 Git Bash) | shell 재기동 스크립트는 bash 필요 |
| Android Studio + JDK 21 | 선택 | Android 셸에만 필요. `pnpm android:run` 이 시스템 Java < 21 이면 JDK 21 자동 다운로드 |
| Docker | 선택 | 프로덕션 compose 를 로컬에서 똑같이 돌려보고 싶을 때만 |

corepack 으로 pnpm 버전 고정하는 걸 추천:

```bash
corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm -v   # 8.15.4 가 나오면 OK
```

---

## 2. 원커맨드 기동(추천)

```bash
git clone https://github.com/yuanzui0728/enclave.git && cd enclave
pnpm install                       # workspace 패키지(apps/* + packages/*)
( cd api && npm install )          # api 는 자체 npm lock 을 쓰며 pnpm workspace 멤버가 아니므로 별도 설치 필수
cp api/.env.example api/.env
# api/.env 편집: 최소한 DEEPSEEK_API_KEY 와 ADMIN_SECRET 채우기
pnpm dev:api                       # NestJS 백엔드(:3000)
pnpm dev:app                       # 메인 앱 Vite dev(:5180)
```

> 🛠 독립 운영 콘솔 `apps/admin` 은 폐지되어 cloud console 로 통합되었습니다. 셀프호스트 / 싱글테넌트에서는 백엔드의 `/admin/*` API(`ADMIN_SECRET` 로 인증)를 직접 호출하면 되며, 별도 프런트를 띄울 필요가 없습니다.

> ⚠️ 여기서 `pnpm dev` 를 그냥 실행하지 마세요: 이 명령은 멀티테넌트 클라우드 흐름용(app + wiki + cloud-api + cloud-console 기동)이며 **의도적으로 api 를 포함하지 않습니다** —— 셀프호스트 / 싱글테넌트 개발에서는 오히려 api 가 :3000 에 단독으로 떠 있어야 합니다.

`pnpm dev:*` 는 프로세스를 백그라운드로 detach 하며, **로그는 `logs/dev-services/<service>.{out,err}.log` 로 떨어지고 터미널에는 스트리밍되지 않습니다**. 실시간으로 따라가려면:

```bash
tail -f logs/dev-services/api.out.log
```

열기:

- 메인 앱: <http://localhost:5180>
- 백엔드 API: <http://localhost:3000>(운영 엔드포인트는 `/admin/*`, `ADMIN_SECRET` 로 인증)

---

## 3. 서비스 & 포트

| 서비스 | 단독 기동 | 포트 |
|------|------|------|
| 백엔드 API(NestJS) | `pnpm dev:api` | 3000 |
| 메인 앱(Vite) | `pnpm dev:app` | 5180 |
| Cloud Console | `pnpm dev:cloud-console` | 5182 |
| Cloud API | `pnpm dev:cloud-api` | 3001 |
| Wiki | `pnpm dev:wiki` | 5184 |
| Site | `pnpm dev:site` | - |
| Desktop(Tauri) | `pnpm dev:desktop` | - |
| WeChat Connector | `pnpm dev:wechat-connector` | - |

---

## 4. 프로세스 관리: 정지 / 재기동 / 상태

### 전체
```bash
pnpm dev:stop       # 현재 workspace 의 모든 서비스 정지
pnpm dev:restart    # 전체 재기동
pnpm dev:status     # 무엇이 돌고 있는지 / 어떤 포트가 점유됐는지
pnpm dev:all        # workspace + cloud 까지 같이
```

### 개별 서비스(각 서비스마다 `:stop` / `:restart` / `:status` 세트 제공)
```bash
pnpm dev:api:restart
pnpm dev:app:restart
pnpm dev:cloud-api:restart
pnpm dev:cloud-console:restart
pnpm dev:wiki:restart
pnpm dev:site:restart
```

### Shell 재기동 스크립트(레포 루트에 위치)

pnpm 스크립트 이름 외우기 귀찮을 때 동등하게 쓸 수 있는 진입점:

```
./restart-app.sh            # 메인 앱 + 필요한 의존 서비스 재기동
./restart-cloud-api.sh      # Cloud API 재기동
./restart-cloud-console.sh  # Cloud Console 재기동
./restart-wiki.sh           # Wiki 재기동
./restart-site.sh           # Site 재기동
./restart-app-only.sh       # 메인 앱만, 나머지는 건드리지 않음
```

---

## 5. 환경 변수(`api/.env`)

**필수**:

- `DEEPSEEK_API_KEY` — DeepSeek 또는 OpenAI 호환 게이트웨이의 API 키
- `ADMIN_SECRET` — 긴 랜덤 문자열. 첫 부팅 때 이 값으로 유일 오너를 생성

**자주 쓰는 선택값**:

- `OPENAI_BASE_URL`(기본 `https://api.deepseek.com`)
- `AI_MODEL`(기본 `deepseek-chat`)
- `JWT_SECRET`(개발 단계에선 기본값으로 OK)
- `PORT`(기본 3000)
- `DATABASE_PATH`(기본 `./data/database.sqlite`)
- `PUBLIC_API_BASE_URL` — 단일 도메인 배포 시 공개 Web 루트(예: `https://app.your-domain.com`). **`/api` 접미사 붙이지 않음.**
- `CORS_ALLOWED_ORIGINS` — `localhost:5180/5182` 등은 기본 포함
- `SMTP_*` / `MAIL_FROM_ADDRESS` — 채워두면 메일로 인증 코드 발송. 비워두면 코드가 **API 로그에 출력**(로컬 개발에 편리)
- `USER_API_KEY_ENCRYPTION_SECRET` — 사용자가 자기 API 키를 가져올 때 암호화에 사용

전체 목록은 `api/.env.example` 참고.

---

## 6. 데이터베이스

- 엔진: SQLite(`better-sqlite3`)
- 기본 경로: 레포 루트의 `data/database.sqlite`
- 기동 시 TypeORM `synchronize: true`, **수동 마이그레이션 불필요**
- 첫 부팅에 자동: 기본 캐릭터 seed → AI 관계 초기화 → 단일 오너 마이그레이션
- 이전 경로(`api/database.sqlite` / `api/data/database.sqlite`)는 새 경로로 자동 이동

처음부터 다시 시작: `data/database.sqlite` 삭제 후 api 재기동.

---

## 7. Android 로컬 개발

```bash
# .env 의 PUBLIC_API_BASE_URL 가 가리키는 API 를 사용
pnpm android:run

# 로컬 API(127.0.0.1:39092) 띄우고 + 에뮬레이터를 10.0.2.2:39092 로 연결
pnpm android:run:local

# 또는 바로:
./start-android-emulator.sh
```

`pnpm android:run` 이 자동으로: `ANDROID_SDK_ROOT` 보완 → 필요 시 JDK 21 다운로드 → 실행 중인 에뮬레이터 연결(없으면 첫 번째 사용 가능한 AVD 부팅) → 웹 번들 빌드 → Capacitor sync → Debug APK 설치 → 앱 기동.

보조 커맨드: `pnpm android:doctor`(환경 체크), `pnpm android:open`(Android Studio 에서 열기), `pnpm android:apk` / `android:bundle`(빌드 결과물).

---

## 8. 헬스 체크

```bash
curl http://localhost:3000/health      # api 단독으로 띄울 때
curl http://localhost/healthz          # docker-compose 의 web 리버스 프록시 뒤
```

---

## 9. 자주 막히는 지점

- **포트 이미 사용 중**: `pnpm dev:status` 로 지난 프로세스가 남아 있는지 확인 → `pnpm dev:stop` 후 `pnpm dev`.
- **`pnpm install` 느림**: `pnpm config set registry https://registry.npmmirror.com`.
- **DeepSeek 키가 아직 없음**: `OPENAI_BASE_URL` + `AI_MODEL` 을 원하는 OpenAI 호환 게이트웨이로 돌리고, 그 키를 `DEEPSEEK_API_KEY` 에 입력.
- **cloud 세트를 띄우고 싶지 않음**: `pnpm dev` 그대로(기본 workspace 는 cloud 미포함). `pnpm dev:all` 에서만 cloud 가 합쳐짐.

---

## 10. 더 읽기

- [README.ko.md](README.ko.md) — 제품 소개 / Docker 3분 기동
- [DEPLOY.md](DEPLOY.md) — 프로덕션 배포 가이드
- [CONTRIBUTING.md](CONTRIBUTING.md) — 기여 가이드
