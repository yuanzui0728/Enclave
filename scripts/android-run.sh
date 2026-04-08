#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SHELL_DIR="$ROOT_DIR/apps/android-shell"
ANDROID_PROJECT_DIR="$ANDROID_SHELL_DIR/android"
LOCAL_TOOLS_DIR="$ROOT_DIR/.cache/tools"
LOCAL_JDK_DIR="$LOCAL_TOOLS_DIR/jdk-21"
LOCAL_JDK_DOWNLOAD_DIR="$LOCAL_TOOLS_DIR/downloads"
APP_ID="$(node -e "const fs=require('fs'); const path=require('path'); const cfg=JSON.parse(fs.readFileSync(path.join(process.argv[1], 'apps/android-shell/capacitor.config.json'),'utf8')); process.stdout.write(cfg.appId);" "$ROOT_DIR")"

log() {
  printf '[android-run] %s\n' "$*"
}

fail() {
  printf '[android-run] %s\n' "$*" >&2
  exit 1
}

ensure_android_sdk() {
  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
    return
  fi

  if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME}" ]]; then
    export ANDROID_SDK_ROOT="${ANDROID_HOME}"
    return
  fi

  if [[ -d "${HOME}/Android/Sdk" ]]; then
    export ANDROID_SDK_ROOT="${HOME}/Android/Sdk"
    export ANDROID_HOME="${ANDROID_SDK_ROOT}"
    return
  fi

  fail "Android SDK not found. Set ANDROID_SDK_ROOT or install the SDK under ~/Android/Sdk."
}

append_android_sdk_path() {
  export PATH="${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/emulator:${PATH}"
}

current_java_major() {
  node -e "const { spawnSync } = require('child_process'); const result = spawnSync('java', ['-version'], { encoding: 'utf8' }); if (result.status !== 0) { process.stdout.write('0'); process.exit(0); } const output = [result.stdout || '', result.stderr || ''].join('\n'); const match = output.match(/version \\\"(\\d+(?:\\.\\d+)?)/); if (!match) { process.stdout.write('0'); process.exit(0); } const raw = match[1]; if (raw.startsWith('1.')) { process.stdout.write(String(Number(raw.split('.')[1]) || 0)); process.exit(0); } process.stdout.write(String(Number(raw.split('.')[0]) || 0));"
}

download_local_jdk() {
  mkdir -p "$LOCAL_JDK_DOWNLOAD_DIR"

  local archive_path="$LOCAL_JDK_DOWNLOAD_DIR/temurin-21.tar.gz"
  local temp_extract_dir="$LOCAL_TOOLS_DIR/jdk-extract"

  if [[ ! -x "$LOCAL_JDK_DIR/bin/java" ]]; then
    log "Downloading JDK 21 to $LOCAL_JDK_DIR"
    rm -rf "$temp_extract_dir"
    mkdir -p "$temp_extract_dir"
    curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk" -o "$archive_path"
    tar -xzf "$archive_path" -C "$temp_extract_dir"
    local extracted_dir
    extracted_dir="$(find "$temp_extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    [[ -n "$extracted_dir" ]] || fail "Failed to extract JDK 21 archive."
    rm -rf "$LOCAL_JDK_DIR"
    mv "$extracted_dir" "$LOCAL_JDK_DIR"
    rm -rf "$temp_extract_dir"
  fi

  export JAVA_HOME="$LOCAL_JDK_DIR"
  export PATH="$JAVA_HOME/bin:$PATH"
}

ensure_java() {
  local java_major=0

  if command -v java >/dev/null 2>&1; then
    java_major="$(current_java_major)"
  fi

  if [[ "$java_major" -ge 21 ]]; then
    return
  fi

  download_local_jdk

  java_major="$(current_java_major)"
  [[ "$java_major" -ge 21 ]] || fail "Java 21+ is required, but no usable JDK was found."
}

first_online_device() {
  adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }'
}

wait_for_boot() {
  local serial="$1"
  local boot_completed=""

  for _ in $(seq 1 120); do
    boot_completed="$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [[ "$boot_completed" == "1" ]]; then
      return 0
    fi
    sleep 2
  done

  return 1
}

ensure_device() {
  local serial=""
  serial="$(first_online_device)"

  if [[ -n "$serial" ]]; then
    export ANDROID_SERIAL="$serial"
    return
  fi

  local avd_name=""
  avd_name="$(emulator -list-avds | head -n 1)"
  [[ -n "$avd_name" ]] || fail "No Android device connected and no AVD found."

  log "Starting emulator $avd_name"
  nohup emulator "@${avd_name}" >/tmp/yinjie-android-emulator.log 2>&1 &

  adb wait-for-device >/dev/null
  serial="$(first_online_device)"
  [[ -n "$serial" ]] || fail "Emulator started but no device became available."

  log "Waiting for emulator boot to complete"
  wait_for_boot "$serial" || fail "Emulator boot timed out. Check /tmp/yinjie-android-emulator.log."
  export ANDROID_SERIAL="$serial"
}

warn_if_backend_unreachable() {
  local api_base_url=""
  api_base_url="$(node -e "const fs=require('fs'); const path=require('path'); const file=path.join(process.argv[1], 'apps/app/public/runtime-config.json'); const cfg=JSON.parse(fs.readFileSync(file,'utf8')); process.stdout.write(cfg.apiBaseUrl || '');" "$ROOT_DIR")"

  if [[ -z "$api_base_url" ]]; then
    log "No apiBaseUrl configured. The app may stop at runtime setup."
    return
  fi

  local host_probe_url="$api_base_url"
  host_probe_url="${host_probe_url/10.0.2.2/127.0.0.1}"
  host_probe_url="${host_probe_url%/}/health"

  if ! curl -fsS --max-time 5 "$host_probe_url" >/dev/null 2>&1; then
    log "Backend check failed for $host_probe_url. The Android app can still launch, but network requests may fail."
  fi
}

build_and_install() {
  log "Configuring Android shell"
  pnpm android:configure

  log "Syncing web bundle into Android project"
  pnpm android:sync

  log "Building and installing debug app on $ANDROID_SERIAL"
  (
    cd "$ANDROID_PROJECT_DIR"
    ./gradlew installDebug
  )
}

launch_app() {
  log "Launching $APP_ID on $ANDROID_SERIAL"
  adb -s "$ANDROID_SERIAL" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
}

main() {
  cd "$ROOT_DIR"
  ensure_android_sdk
  append_android_sdk_path
  ensure_java
  ensure_device
  warn_if_backend_unreachable
  build_and_install
  launch_app
  log "Android app is installed and launched."
}

main "$@"
