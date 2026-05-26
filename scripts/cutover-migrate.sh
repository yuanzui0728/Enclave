#!/usr/bin/env bash
# 全量 cutover 迁移：对每个账号 DB 在 staging 副本上跑 prep→step0→step1→step1b，
# 成功的并入 data/shared-world/database.sqlite。源库(data/accounts)绝不改动=回滚安全。
# 失败账号记入 failures，不进 SHARED_WORLD_PHONES（保留在 LPP）。
set -u
ROOT=/home/ps/claude/yinjie-app
cd "$ROOT/api"
M=scripts/migrations
STAGE="$ROOT/data/_cutover-staging"
SHARED="$ROOT/data/shared-world/database.sqlite"
rm -rf "$STAGE"; mkdir -p "$STAGE"
mkdir -p "$ROOT/data/shared-world"
rm -f "$SHARED" "$SHARED-wal" "$SHARED-shm"

OK_PHONES="$STAGE/_ok_phones.txt"; : > "$OK_PHONES"
FAIL_LOG="$STAGE/_failures.txt"; : > "$FAIL_LOG"
SRCS=""
total=0; ok=0; fail=0

for phone in $(ls "$ROOT/data/accounts/"); do
  src="$ROOT/data/accounts/$phone/database.sqlite"
  [ -f "$src" ] || continue
  case "$phone" in ''|*[!0-9]*) echo "SKIP non-phone dir: $phone"; continue;; esac
  total=$((total+1))
  d="$STAGE/$phone"; mkdir -p "$d"; dst="$d/database.sqlite"
  cp "$src" "$dst"
  [ -f "$src-wal" ] && cp "$src-wal" "$dst-wal" 2>/dev/null
  [ -f "$src-shm" ] && cp "$src-shm" "$dst-shm" 2>/dev/null
  if node $M/2026-mt-prep-schema-catchup.mjs "$dst" >/dev/null 2>>"$d/err.log" \
     && node $M/2026-mt-step0-remap-owner-id.mjs "$dst" "$phone" >/dev/null 2>>"$d/err.log" \
     && node $M/2026-mt-step1-backfill-owner.mjs "$dst" >/dev/null 2>>"$d/err.log" \
     && node $M/2026-mt-step1b-composite-pk.mjs "$dst" >/dev/null 2>>"$d/err.log"; then
    echo "$phone" >> "$OK_PHONES"
    SRCS="$SRCS $dst"
    ok=$((ok+1))
    echo "[$total] OK $phone"
  else
    echo "$phone : pipeline failed (see $d/err.log)" >> "$FAIL_LOG"
    fail=$((fail+1))
    echo "[$total] FAIL $phone — $(tail -1 $d/err.log 2>/dev/null)"
  fi
done

echo "=== pipeline done: total=$total ok=$ok fail=$fail ==="
echo "=== step2 union ($ok srcs) → $SHARED ==="
node $M/2026-mt-step2-merge-into-shared.mjs "$SHARED" $SRCS 2>&1 | tail -4
echo "=== verify ==="
node $M/2026-mt-verify-shared.mjs "$SHARED" 2>&1 | tail -12
echo "=== FAILURES ==="; cat "$FAIL_LOG" 2>/dev/null || echo "(none)"
echo "CUTOVER_MIGRATE_DONE ok=$ok fail=$fail"
