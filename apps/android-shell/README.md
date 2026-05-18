# Android Shell

This package hosts the Capacitor-based Android container for `apps/app`.

## Ship Status (2026-05-18)

- ✅ **Debug APK** — `pnpm android:apk` 一键产出 `apps/android-shell/android/app/build/outputs/apk/debug/app-debug.apk`，emulator (API 36) 装上能开能登录能切语言。
- ✅ **Release APK / AAB（已签名）** — `pnpm android:bundle:release` 产出 `app-release.aab` + `gradlew assembleRelease` 产出 `app-release.apk`（均已用 `apps/android-shell/.cache/keystores/yinjie-upload.jks` 签名）。release APK 装到 emulator 上 R8 minify + shrinkResources 后所有 plugin 仍能反射调用（Round 4 修过 proguard rules）。
- ⚠️ **FCM 推送 — 暂未启用**。`apps/android-shell/android/app/google-services.json` 缺失，`build.gradle` 里 `apply plugin: 'com.google.gms.google-services'` 是 try/catch 兜底，缺 json 时静默跳过，包能照常打出来但推送 silently 不工作（`getPushToken` 永远返 null）。`pnpm android:doctor` 末尾会打一条 `note` 提醒，**不阻断 build**。
- ⚠️ **真机走查未做**。当前能动到的只有 Linux 上的 Android Emulator（API 36, x86_64, Google APIs Play Store, KVM）。真机才能挖出来的盲点见 [docs/emulator-blind-spots.md](./docs/emulator-blind-spots.md)。

历史上跑过 38 轮**真机走查**（R1..R36 + 新一轮 R1..R2）；本会话补了
**模拟器走查 R3..R5**（cloudApiBaseUrl tracked 默认 / proguard rules /
doctor 加 google-services 提示）。

### 启用 FCM 三步

1. Firebase Console → 建项目 / 选 existing → 「Add app → Android」
   填 `applicationId = com.yinjie.mobile`（与 `android-shell.config.json`
   的 `appId` 完全一致），SHA-1 可选；
2. 下载 `google-services.json` → 放到
   `apps/android-shell/android/app/google-services.json`
   （已在 `.gitignore` 里，**不要 commit**）；
3. `pnpm android:doctor` 看到 `ok  android/app/google-services.json` 即可，
   重新 `pnpm android:bundle:release` 打包，FCM service 自动 wire 上，
   `YinjieMobileBridge.getPushToken()` 第一次开 app 就能拿到非空 token。

## Commands

- `pnpm android:run`
- `pnpm android:run:local`
- `pnpm android:configure`
- `pnpm android:init`
- `pnpm android:sync`
- `pnpm android:open`
- `pnpm android:apk`
- `pnpm android:bundle`
- `pnpm android:doctor`

## Notes

- `pnpm android:run` is the default local development entrypoint for Android.
- `pnpm android:run:local` also starts the Nest API locally on `127.0.0.1:39092` and rewrites `android-shell.config.local.json` to `10.0.2.2:39092`.
- It will auto-detect `ANDROID_SDK_ROOT`, reuse a connected device or start the first available emulator, and install-launch the debug app.
- If the current Java runtime is lower than 21, it downloads a local JDK 21 into `.cache/tools/jdk-21` and uses it only for this repository.
- `pnpm android:apk` and `pnpm android:bundle` now also auto-detect the Android SDK and can reuse/download the same local JDK 21 cache for Gradle builds.
- `apps/android-shell/android-release.env.example` contains a release env template for `android:bundle`.
- `pnpm android:doctor:release` and `pnpm android:bundle:release` load `apps/android-shell/android-release.env.local` automatically when present.

- The Android shell targets remote Core API mode.
- `apps/app/dist` is used as the web bundle source.
- Native Android project files are generated under `apps/android-shell/android/`.
- Runtime defaults and release metadata are sourced from `apps/android-shell/android-shell.config.json`.
- Machine-local overrides can be placed in `apps/android-shell/android-shell.config.local.json`.
- A local override example is provided in `apps/android-shell/android-shell.config.local.example.json`.
- Release signing placeholders can be provided through `apps/android-shell/android-signing.local.properties`.
- The current Capacitor Android dependency graph compiles with Java 21.
- `android:configure` writes app id, app name, version, and Android shell metadata; local runtime endpoints are no longer flushed back into tracked `AndroidManifest.xml`.
- `android:sync` / `android:apk` / `android:bundle` build `apps/app` with the shared mobile-shell entry and inject `apps/app/dist/runtime-config.json`.
- `pnpm android:doctor` checks the active config and, when `android-shell.config.local.json` exists, still checks tracked production defaults so local overrides do not hide release issues.
- `pnpm android:doctor` now also checks whether the active Java runtime is at least 21.
- `pnpm android:bundle` ignores `android-shell.config.local.json`; it can use `YINJIE_ANDROID_*` environment variables as release overrides, and still fails fast when the resulting release runtime config is incomplete.
- Cleartext traffic is wired through a manifest placeholder (`${yinjieUsesCleartextTraffic}`) injected by build.gradle: debug builds enable it, release builds always disable it. The tracked `AndroidManifest.xml` and `capacitor.config.json` always carry the production-safe values; `pnpm android:configure` no longer rewrites them.
- `pnpm android:doctor` lints the tracked manifest for cleartext placeholder usage, dev/loopback endpoints, and the `https` androidScheme so a regression like commit db4bb152 cannot silently land again.
- Android backup and device-transfer extraction are explicitly disabled in the generated manifest resources.
- Chat voice/video capture in the WebView relies on Capacitor's built-in `BridgeWebChromeClient` permission flow, so the shell manifest must keep `CAMERA`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`.
- Release signing can come from `apps/android-shell/android-signing.local.properties` or from `YINJIE_UPLOAD_STORE_FILE` / `YINJIE_UPLOAD_STORE_PASSWORD` / `YINJIE_UPLOAD_KEY_ALIAS` / `YINJIE_UPLOAD_KEY_PASSWORD`.

## Release Environment Variables

- Copy `apps/android-shell/android-release.env.example` to `apps/android-shell/android-release.env.local` for local release builds, or set `YINJIE_ANDROID_RELEASE_ENV_FILE` to point to another env file.
- `YINJIE_ANDROID_CORE_API_BASE_URL` for the release Core API base URL
- `YINJIE_ANDROID_SOCKET_BASE_URL` for the release socket base URL; defaults to the Core API URL when omitted
- `YINJIE_ANDROID_ENVIRONMENT` optional, defaults to tracked config
- `YINJIE_ANDROID_APP_NAME` optional, overrides the bundled app name metadata for the build
- `YINJIE_ANDROID_VERSION_NAME` optional
- `YINJIE_ANDROID_VERSION_CODE` optional
- `YINJIE_ANDROID_ALLOW_CLEARTEXT_TRAFFIC` optional, should stay `false` for release

For release signing, Gradle also accepts:

- `YINJIE_UPLOAD_STORE_FILE`
- `YINJIE_UPLOAD_STORE_PASSWORD`
- `YINJIE_UPLOAD_KEY_ALIAS`
- `YINJIE_UPLOAD_KEY_PASSWORD`

Recommended local release flow:

1. Create `apps/android-shell/android-release.env.local`
2. Run `pnpm android:release:doctor`
3. Run `pnpm android:release:bundle`

## Web-to-Shell Contract

The mobile web layer now expects three Android-side contracts:

1. Runtime config injection
   - Provide `apiBaseUrl`
   - Provide `socketBaseUrl`
   - Provide `environment`
   - Provide app metadata such as `applicationId`, `versionName`, and `versionCode`
   - The bundled fallback file is injected at `apps/app/dist/runtime-config.json` after each shell web build
   - Native Android runtime now prefers bundled `assets/public/runtime-config.json`; manifest meta-data stays as fallback only

2. Native bridge surface
   - `YinjieSecureStorage`
   - `YinjieMobileBridge`

Current Android-side implementation status:

- `YinjieSecureStorage`
  - uses `EncryptedSharedPreferences` when available
  - falls back to private app `SharedPreferences` if encrypted storage cannot be created
- `YinjieMobileBridge`
  - `openExternalUrl` is wired
  - `openAppSettings` is wired
  - `share` is wired
  - `shareFile` writes a temp file into app cache and opens the Android share sheet through `FileProvider`
  - `openFile` writes a temp file into app cache and opens Android file preview apps through `ACTION_VIEW`
  - `pickImages` opens Android document picker and returns portable file assets
  - `pickFile` opens Android document picker and returns a single portable file asset
  - `captureImage` opens the system camera and returns a captured image asset through `FileProvider`
  - `getPushToken` reads the cached token slot used by `YinjieFirebaseMessagingService`
  - `getNotificationPermissionState` and `requestNotificationPermission` are wired
  - `showLocalNotification` is wired for in-app reminder notifications
- `YinjieFirebaseMessagingService`
  - persists the latest FCM registration token into the bridge cache
  - creates a basic notification channel and shows fallback notifications for incoming FCM messages
  - forwards push tap targets through `Intent extras` so the web layer can resume into chat list, direct chat, or group chat

3. Locale bridge
   - `YinjieRuntime.getLocale()` returns the active supported locale and whether it came from Android app language, system language, or default fallback
   - `YinjieRuntime.setLocale({ locale })` applies the App language chosen in the shared Web UI back to Android
   - First launch follows Android system language when it is Simplified Chinese, English, Japanese, or Korean; unsupported system languages fall back to Simplified Chinese
   - Android 13+ exposes the same language set through the system App Language settings via `res/xml/locales_config.xml`
   - Native Android strings cover launcher/activity labels, share/open chooser fallback titles, notification channel text, and fallback push notification text

Expected `YinjieMobileBridge` methods:

- `openExternalUrl({ url })`
- `openAppSettings()`
- `share({ title?, text?, url? })`
- `shareFile({ base64Data, fileName, mimeType?, title? })`
- `openFile({ base64Data, fileName, mimeType?, title? })`
- `pickImages({ multiple? })`
- `pickFile()`
- `captureImage()`
- `getPushToken()`
- `getNotificationPermissionState()`
- `requestNotificationPermission()`
- `showLocalNotification({ id?, title, body, route?, conversationId?, groupId?, source? })`
- `getPendingLaunchTarget()`
- `clearPendingLaunchTarget()`

Expected `YinjieRuntime` locale methods:

- `getLocale()`
- `setLocale({ locale: "zh-CN" | "en-US" | "ja-JP" | "ko-KR" })`

The web layer will gracefully fall back when the bridge is not wired yet, but Android release builds should eventually connect these methods to platform-native implementations.

Push payload examples and field rules are documented in `docs/release/mobile-push-payload-contract.md`.

## Emulator vs 真机走查盲点

历史上 R1..R36 跑的都是真机走查。本会话「新一轮 R3..R5」补的是
Linux 上 Android Emulator (API 36, x86_64, KVM) 跑出来的问题，覆盖
WebView / Activity / Permission / Locale / Manifest / R8 minify 层。

**模拟器一律测不到的真机盲区**（FCM 真链路 / OEM 自带相机 / SIM 拨号 /
Pre-API-25 兼容 / OEM 键盘默认 / 生物识别 / 运营商 4G）见
[docs/emulator-blind-spots.md](./docs/emulator-blind-spots.md)，
是下一轮真机走查的入口清单。
