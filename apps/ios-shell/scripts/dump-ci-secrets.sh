#!/usr/bin/env bash
# 一键收集 iOS Release CI 需要的全部 secret，并可选直接通过 gh 提交到
# GitHub repo（避免一个个手动 paste 到 Settings UI）。
#
# 用法（macOS）：
#   bash apps/ios-shell/scripts/dump-ci-secrets.sh
# 默认只打印（dry run）；想直接提交到 mireyasaulo/Enclave：
#   bash apps/ios-shell/scripts/dump-ci-secrets.sh --commit
# 仓库可覆盖：
#   bash apps/ios-shell/scripts/dump-ci-secrets.sh --commit --repo your/fork
#
# 提示：脚本只读你本地文件，不会上传 .p12 / .p8 本身，只 base64 编码 +
# 通过 gh secret set（HTTPS）传给 GitHub。

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: 必须在 macOS 上跑（要读 Keychain / 用 plutil / security 命令）" >&2
  exit 1
fi

COMMIT=0
REPO="mireyasaulo/Enclave"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) COMMIT=1; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

read -r -p "Distribution .p12 路径: " CERT_PATH
read -r -s -p ".p12 密码: " CERT_PASSWORD
echo
read -r -p "Provisioning .mobileprovision 路径: " PROFILE_PATH
read -r -p "Apple Developer Team ID (10 位): " TEAM_ID
read -r -p "Bundle Identifier [com.yinjie.ios]: " BUNDLE_ID
BUNDLE_ID="${BUNDLE_ID:-com.yinjie.ios}"
read -r -p "APNs Environment (production/development) [production]: " APS_ENV
APS_ENV="${APS_ENV:-production}"
read -r -p "Keychain 临时密码 (任意字符串) [yinjie-ios-build]: " KEYCHAIN_PASSWORD
KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-yinjie-ios-build}"

[[ -f "$CERT_PATH" ]] || { echo "ERROR: $CERT_PATH 不存在"; exit 1; }
[[ -f "$PROFILE_PATH" ]] || { echo "ERROR: $PROFILE_PATH 不存在"; exit 1; }

echo
echo "—— 解析 provisioning profile ——"
PROFILE_NAME=$(security cms -D -i "$PROFILE_PATH" \
  | plutil -extract Name raw -o - - )
echo "Profile Name: $PROFILE_NAME"

echo
echo "—— 解析 .p12 里的签名身份 ——"
TMP_KEYCHAIN="/tmp/yinjie-ci-secrets-$$.keychain-db"
trap 'security delete-keychain "$TMP_KEYCHAIN" 2>/dev/null || true' EXIT
security create-keychain -p "$KEYCHAIN_PASSWORD" "$TMP_KEYCHAIN" >/dev/null
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$TMP_KEYCHAIN" >/dev/null
security import "$CERT_PATH" -P "$CERT_PASSWORD" -A -t cert -f pkcs12 -k "$TMP_KEYCHAIN" >/dev/null
SIGN_IDENTITY=$(security find-identity -p codesigning -v "$TMP_KEYCHAIN" \
  | awk -F'"' 'NR==1 {print $2}')
echo "Code Sign Identity: $SIGN_IDENTITY"

if [[ -z "$SIGN_IDENTITY" ]]; then
  echo "ERROR: 没从 .p12 读出 codesign identity，密码错或证书坏"; exit 1
fi

CERT_BASE64=$(base64 -i "$CERT_PATH")
PROFILE_BASE64=$(base64 -i "$PROFILE_PATH")

declare -A SECRETS=(
  [IOS_DISTRIBUTION_CERT_BASE64]="$CERT_BASE64"
  [IOS_DISTRIBUTION_CERT_PASSWORD]="$CERT_PASSWORD"
  [IOS_PROVISIONING_PROFILE_BASE64]="$PROFILE_BASE64"
  [IOS_PROVISIONING_PROFILE_NAME]="$PROFILE_NAME"
  [IOS_DEVELOPMENT_TEAM]="$TEAM_ID"
  [IOS_CODE_SIGN_IDENTITY]="$SIGN_IDENTITY"
  [IOS_KEYCHAIN_PASSWORD]="$KEYCHAIN_PASSWORD"
  [IOS_BUNDLE_IDENTIFIER]="$BUNDLE_ID"
  [IOS_APS_ENVIRONMENT]="$APS_ENV"
)

echo
echo "—— Summary ——"
for key in IOS_DISTRIBUTION_CERT_BASE64 IOS_DISTRIBUTION_CERT_PASSWORD \
           IOS_PROVISIONING_PROFILE_BASE64 IOS_PROVISIONING_PROFILE_NAME \
           IOS_DEVELOPMENT_TEAM IOS_CODE_SIGN_IDENTITY \
           IOS_KEYCHAIN_PASSWORD IOS_BUNDLE_IDENTIFIER IOS_APS_ENVIRONMENT; do
  value="${SECRETS[$key]}"
  if [[ "$key" == *"BASE64" ]]; then
    echo "  $key: <base64, ${#value} chars>"
  elif [[ "$key" == *"PASSWORD" ]]; then
    echo "  $key: <hidden, ${#value} chars>"
  else
    echo "  $key: $value"
  fi
done

if [[ $COMMIT -eq 0 ]]; then
  echo
  echo "Dry run。要直接通过 gh 提交到 $REPO，重跑加 --commit："
  echo "  bash $0 --commit --repo $REPO"
  exit 0
fi

if ! command -v gh >/dev/null; then
  echo "ERROR: 没装 gh CLI（brew install gh）"; exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh 未登录（gh auth login）"; exit 1
fi

echo
echo "—— 提交到 GitHub ($REPO) ——"
for key in "${!SECRETS[@]}"; do
  printf "%s" "${SECRETS[$key]}" | gh secret set "$key" -R "$REPO" --body -
  echo "  set $key"
done

echo
echo "全部 secret 已写入 $REPO。"
echo "下一步触发 workflow："
echo "  gh workflow run ios-release.yml -R $REPO -f exportMethod=release-testing"
