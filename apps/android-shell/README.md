# Android Shell

This package hosts the Capacitor-based Android container for `apps/app`.

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

- The Android shell targets remote Core API mode.
- `apps/app/dist` is used as the web bundle source.
- Native Android project files are generated under `apps/android-shell/android/`.
- Runtime defaults and release metadata are sourced from `apps/android-shell/android-shell.config.json`.
- Machine-local overrides can be placed in `apps/android-shell/android-shell.config.local.json`.
- A local override example is provided in `apps/android-shell/android-shell.config.local.example.json`.
- Release signing placeholders can be provided through `apps/android-shell/android-signing.local.properties`.
- The current Capacitor Android dependency graph compiles with Java 21.
- `android:configure` writes app id, app name, version, manifest runtime metadata, and `apps/app/public/runtime-config.json`.
- `pnpm android:doctor` will fail the production endpoint check until `runtime.apiBaseUrl` is configured.
- `pnpm android:doctor` now also checks whether the active Java runtime is at least 21.
- Production defaults disable cleartext traffic; local debugging can override it in `android-shell.config.local.json`.
- Android backup and device-transfer extraction are explicitly disabled in the generated manifest resources.

## Web-to-Shell Contract

The mobile web layer now expects two Android-side contracts:

1. Runtime config injection
   - Provide `apiBaseUrl`
   - Provide `socketBaseUrl`
   - Provide `environment`
   - Provide app metadata such as `applicationId`, `versionName`, and `versionCode`
   - `android:configure` already writes the web fallback file at `apps/app/public/runtime-config.json`

2. Native bridge surface
   - `YinjieSecureStorage`
   - `YinjieMobileBridge`

Current Android-side implementation status:

- `YinjieSecureStorage`
  - uses `EncryptedSharedPreferences` when available
  - falls back to private app `SharedPreferences` if encrypted storage cannot be created
- `YinjieMobileBridge`
  - `openExternalUrl` is wired
  - `share` is wired
  - `pickImages` opens Android document picker and returns URI assets
  - `getPushToken` reads the cached token slot used by `YinjieFirebaseMessagingService`
  - `getNotificationPermissionState` and `requestNotificationPermission` are wired
  - `showLocalNotification` is wired for in-app reminder notifications
- `YinjieFirebaseMessagingService`
  - persists the latest FCM registration token into the bridge cache
  - creates a basic notification channel and shows fallback notifications for incoming FCM messages
  - forwards push tap targets through `Intent extras` so the web layer can resume into chat list, direct chat, or group chat

Expected `YinjieMobileBridge` methods:

- `openExternalUrl({ url })`
- `share({ title?, text?, url? })`
- `pickImages({ multiple? })`
- `getPushToken()`
- `getNotificationPermissionState()`
- `requestNotificationPermission()`
- `showLocalNotification({ id?, title, body, route?, conversationId?, groupId?, source? })`
- `getPendingLaunchTarget()`
- `clearPendingLaunchTarget()`

The web layer will gracefully fall back when the bridge is not wired yet, but Android release builds should eventually connect these methods to platform-native implementations.

Push payload examples and field rules are documented in `docs/release/mobile-push-payload-contract.md`.
