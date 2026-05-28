# ローカル開発ガイド

[简体中文](DEVELOPMENT.md) · [English](DEVELOPMENT.en.md) · **日本語** · [한국어](DEVELOPMENT.ko.md)

> 3 分で動かしてみたいだけ？ → [README.ja.md](README.ja.md) の Docker ワンライナーへ。
> このガイドは**コントリビューター / ソースから開発する人**向け。ソース起動・停止・再起動・ポート・Android の繋ぎ込みまで一通り。

---

## 1. 必要環境

| 項目 | バージョン | 備考 |
|---|---|---|
| Node.js | ≥ 18 | `scripts/dev-services.mjs` は ESM |
| pnpm | 8.15.4 | `package.json` の `packageManager` で固定済み |
| OS | macOS / Linux / Windows（PowerShell または Git Bash） | shell の再起動スクリプトは bash 必要 |
| Android Studio + JDK 21 | 任意 | Android シェルだけ必要。`pnpm android:run` がシステム Java < 21 のとき JDK 21 を自動取得 |
| Docker | 任意 | 本番 compose をローカルで再現したい場合のみ |

corepack で pnpm を固定するのが推奨：

```bash
corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm -v   # 8.15.4 と出れば OK
```

---

## 2. ワンコマンド起動（推奨）

```bash
git clone https://github.com/yuanzui0728/enclave.git && cd enclave
pnpm install                       # workspace パッケージ（apps/* + packages/*）
( cd api && npm install )          # api は独自の npm lock を持ち pnpm workspace の外、別途インストール必須
cp api/.env.example api/.env
# api/.env を編集：最低限 DEEPSEEK_API_KEY と ADMIN_SECRET を入れる
pnpm dev:api                       # NestJS バックエンド（:3000）
pnpm dev:app                       # メインアプリ Vite dev（:5180）
```

> 🛠 独立した運用画面 `apps/admin` は廃止され、cloud console に統合されました。セルフホスト／シングルテナントではバックエンドの `/admin/*` API（`ADMIN_SECRET` で認証）を直接叩けばよく、別途フロントを立てる必要はありません。

> ⚠️ ここで `pnpm dev` を直接叩かないでください：このコマンドはマルチテナントのクラウド向けで（app + wiki + cloud-api + cloud-console を起動）、**意図的に api を含みません** —— セルフホスト／シングルテナントの開発では逆に api を :3000 で単独で動かす必要があります。

`pnpm dev:*` はプロセスをバックグラウンドに detach し、**ログは `logs/dev-services/<service>.{out,err}.log` に出力されます。ターミナルには流れません**。リアルタイムで追うなら：

```bash
tail -f logs/dev-services/api.out.log
```

開く：

- メインアプリ：<http://localhost:5180>
- バックエンド API：<http://localhost:3000>（運用エンドポイントは `/admin/*`、`ADMIN_SECRET` で認証）

---

## 3. サービスとポート

| サービス | 単独起動 | ポート |
|------|------|------|
| バックエンド API（NestJS） | `pnpm dev:api` | 3000 |
| メインアプリ（Vite） | `pnpm dev:app` | 5180 |
| Cloud Console | `pnpm dev:cloud-console` | 5182 |
| Cloud API | `pnpm dev:cloud-api` | 3001 |
| Wiki | `pnpm dev:wiki` | 5184 |
| Site | `pnpm dev:site` | - |
| Desktop（Tauri） | `pnpm dev:desktop` | - |
| WeChat Connector | `pnpm dev:wechat-connector` | - |

---

## 4. プロセス管理：停止 / 再起動 / ステータス

### 全体
```bash
pnpm dev:stop       # 現在の workspace の全サービス停止
pnpm dev:restart    # 全体再起動
pnpm dev:status     # 何が動いているか / どのポートが取られているか
pnpm dev:all        # workspace + cloud をまとめて
```

### 単一サービス（各サービスに `:stop` / `:restart` / `:status` の三点セット）
```bash
pnpm dev:api:restart
pnpm dev:app:restart
pnpm dev:cloud-api:restart
pnpm dev:cloud-console:restart
pnpm dev:wiki:restart
pnpm dev:site:restart
```

### Shell 再起動スクリプト（リポジトリのルートに配置）

pnpm script 名を覚えるのが面倒なときに。挙動は等価：

```
./restart-app.sh            # メインアプリ + 必要なサービスを再起動
./restart-cloud-api.sh      # Cloud API を再起動
./restart-cloud-console.sh  # Cloud Console を再起動
./restart-wiki.sh           # Wiki を再起動
./restart-site.sh           # Site を再起動
./restart-app-only.sh       # メインアプリのみ。他はそのまま
```

---

## 5. 環境変数（`api/.env`）

**必須**：

- `DEEPSEEK_API_KEY` — DeepSeek または OpenAI 互換ゲートウェイの API キー
- `ADMIN_SECRET` — 長いランダム文字列。初回起動でこの値を使って唯一のオーナーを作成

**よく使う任意項目**：

- `OPENAI_BASE_URL`（既定 `https://api.deepseek.com`）
- `AI_MODEL`（既定 `deepseek-chat`）
- `JWT_SECRET`（開発は既定で OK）
- `PORT`（既定 3000）
- `DATABASE_PATH`（既定 `./data/database.sqlite`）
- `PUBLIC_API_BASE_URL` — 同一ドメイン配信時、公開 Web ルートを設定（例：`https://app.your-domain.com`）。**末尾に `/api` は付けない。**
- `CORS_ALLOWED_ORIGINS` — `localhost:5180/5182` などは既定で含む
- `SMTP_*` / `MAIL_FROM_ADDRESS` — 設定するとメール認証コードを送信。未設定なら**コードは API のログに出力**（ローカル開発に便利）
- `USER_API_KEY_ENCRYPTION_SECRET` — ユーザーが自分の API キーを持ち込むときに必要

完全な一覧は `api/.env.example` を参照。

---

## 6. データベース

- エンジン：SQLite（`better-sqlite3`）
- 既定パス：リポジトリルートの `data/database.sqlite`
- 起動時に TypeORM `synchronize: true`、**手動マイグレーション不要**
- 初回起動で自動：既定キャラクターを seed → AI 関係を初期化 → 単一オーナー移行
- 古いパス（`api/database.sqlite` / `api/data/database.sqlite`）は新パスへ自動移動

最初からやり直したい：`data/database.sqlite` を消して api を再起動。

---

## 7. Android ローカル開発

```bash
# .env の PUBLIC_API_BASE_URL が指す API を使う
pnpm android:run

# ローカル API（127.0.0.1:39092）を起動 + エミュレーターを 10.0.2.2:39092 に向ける
pnpm android:run:local

# または直接：
./start-android-emulator.sh
```

`pnpm android:run` が自動でやること：`ANDROID_SDK_ROOT` を補完 → 必要なら JDK 21 をダウンロード → 起動中のエミュレーターに接続（なければ最初の AVD を起動）→ Web バンドルをビルド → Capacitor sync → Debug APK をインストール → アプリを起動。

補助コマンド：`pnpm android:doctor`（環境チェック）、`pnpm android:open`（Android Studio で開く）、`pnpm android:apk` / `android:bundle`（成果物ビルド）。

---

## 8. ヘルスチェック

```bash
curl http://localhost:3000/health      # api を単独で動かしているとき
curl http://localhost/healthz          # docker-compose の web リバプロ越し
```

---

## 9. よくあるハマり

- **ポートがすでに使われている**：`pnpm dev:status` で前回のプロセスが残っていないか確認 → `pnpm dev:stop` の後 `pnpm dev`。
- **`pnpm install` が遅い**：`pnpm config set registry https://registry.npmmirror.com`。
- **DeepSeek のキーがまだない**：`OPENAI_BASE_URL` + `AI_MODEL` を任意の OpenAI 互換ゲートウェイに向け、そのキーを `DEEPSEEK_API_KEY` に入れる。
- **cloud 一式を起動したくない**：`pnpm dev` のままで大丈夫（workspace の既定に cloud は含まれない）。`pnpm dev:all` のときだけ cloud も走る。

---

## 10. もっと読む

- [README.ja.md](README.ja.md) — プロダクト紹介 / Docker 3 分起動
- [DEPLOY.md](DEPLOY.md) — 本番デプロイガイド
- [CONTRIBUTING.md](CONTRIBUTING.md) — 貢献ガイド
