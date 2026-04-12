# Web 端手机版同步到 Android 和 iOS 规划

日期：2026-04-12
仓库：`/home/ps/claude/yinjie-app`

## 目标

- 把 `apps/app` 中 Web 手机版的最新改动稳定落到 `apps/android-shell` 与 `apps/ios-shell`
- 明确哪些改动天然已共享，哪些仍需要补原生壳能力
- 后续执行时按小步提交推进，不额外生成测试文件

## 现状结论

### 1. 现在并不是“三套移动端代码”

- 真正的业务前端只有一套：`apps/app`
- Android 壳：`apps/android-shell`
- iOS 壳：`apps/ios-shell`
- 两个原生壳都以 Capacitor 承载 `apps/app/dist`

结论：
- 绝大多数“Web 手机版页面/组件/路由”改动，本质上不需要再手抄一份到 Android 或 iOS
- 真正要补的是：
  - Web 包构建与同步链路
  - 原生运行时注入
  - 原生桥接能力
  - 原生权限、通知、上架前配置

### 2. Android 侧已经接近可用，但还不是“跟 Web 手机版完全对齐”

已具备：
- `apps/android-shell/scripts/run-capacitor.mjs` 已串起 `configure / sync / apk / bundle / doctor`
- `apps/android-shell/android/app/src/main/java/com/yinjie/mobile/` 已有：
  - `YinjieRuntimePlugin`
  - `YinjieSecureStoragePlugin`
  - `YinjieMobileBridgePlugin`
  - `YinjieFirebaseMessagingService`
- `MainActivity` 已注册 plugin，并缓存通知点击落点

当前缺口：
- AndroidManifest 目前只看到：
  - `INTERNET`
  - `POST_NOTIFICATIONS`
- 但 Web 手机版已经在这些位置调用麦克风/摄像头：
  - `apps/app/src/features/chat/use-speech-input.ts`
  - `apps/app/src/features/chat/use-self-camera-preview.ts`
- 这意味着 Android 壳还需要补并验证：
  - `RECORD_AUDIO`
  - `CAMERA`
  - WebView 内 `getUserMedia` 的权限体验

### 3. iOS 侧比 README 里写的更完整，但仍有明显收口缺口

已具备：
- `apps/ios-shell/ios/App/App/Plugins/` 下已存在真实实现：
  - `YinjieRuntimePlugin.swift`
  - `YinjieSecureStoragePlugin.swift`
  - `YinjieMobileBridgePlugin.swift`
- `apps/ios-shell/package.json` 已有：
  - `build:web`
  - `prepare:web`
  - `sync`
  - `configure`
  - `doctor`

当前缺口：
- `apps/ios-shell/README.md` 仍把 iOS 描述成“骨架 + stub”阶段，和仓库现状不一致
- 真实 `AppDelegate.swift` 目前只处理了通知点击落点，没有并入模板中的 APNs token 缓存逻辑
- 真实 `Info.plist` 目前没看到这些运行时与权限项：
  - `YinjieApiBaseUrl`
  - `YinjieSocketBaseUrl`
  - `YinjieEnvironment`
  - `YinjiePublicAppName`
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription`
- `ios:configure` 现在会把 `plugins/swift-stub/` 复制进真实工程；后续如果真实实现继续演进，这个脚本有覆盖风险

### 4. 当前同步工作的核心矛盾不是“搬页面”，而是“补壳契约”

Web 手机版已经依赖这些原生能力：
- `apps/app/src/runtime/native-runtime.ts`
- `apps/app/src/runtime/native-secure-storage.ts`
- `apps/app/src/runtime/mobile-bridge.ts`

直接对应的原生壳契约是：
- 运行时配置注入
- 安全存储
- 外链打开
- 系统分享
- 图片选择
- 推送 token 读取
- 通知权限读取/申请
- 本地通知
- 通知点击落点恢复
- 麦克风/摄像头权限与 WebView 能力

## 执行计划

### Phase 1：先做一轮“移动壳能力矩阵”基线盘点

目标：
- 先把 Web 手机版里所有依赖原生壳的能力列全，避免后面只同步 UI，不同步运行时

执行项：
- 基于以下入口整理能力矩阵：
  - `apps/app/src/runtime/mobile-bridge.ts`
  - `apps/app/src/runtime/native-secure-storage.ts`
  - `apps/app/src/runtime/native-runtime.ts`
  - `apps/app/src/features/chat/use-speech-input.ts`
  - `apps/app/src/features/chat/use-self-camera-preview.ts`
- 输出一份平台对照：
  - Web 浏览器
  - Android Capacitor
  - iOS Capacitor
- 标明每项能力的状态：
  - 已对齐
  - Android 缺失
  - iOS 缺失
  - 仅依赖上架配置

完成标准：
- 不再靠印象判断“壳要不要改”
- 每个手机版功能都能追溯到对应原生契约

### Phase 2：收口 Web 包同步链路，避免 Android / iOS 两套口径继续分叉

目标：
- 让两个壳拿到同一份、同一口径、同一构建规则下的 Web 手机版产物

执行项：
- 收口 `apps/app` 面向移动壳的构建方式
- 明确是否统一使用相同的 `base` 策略
  - iOS 现在显式使用 `YINJIE_APP_BUILD_BASE=relative`
  - Android 当前 `ensureWebBuild()` 直接执行 `pnpm --dir ../app build`
- 统一运行时配置写入策略：
  - Android 现在写 `apps/app/public/runtime-config.json`
  - iOS 现在写 `apps/app/dist/runtime-config.json`
- 评估是否增加统一入口脚本，例如：
  - `pnpm mobile:sync:android`
  - `pnpm mobile:sync:ios`
  - 或一个共享的 `prepare-mobile-web` 脚本

完成标准：
- Android / iOS 都能明确拿到最新 `apps/app` 手机版代码
- 同步命令稳定，不靠人工记忆补步骤

建议提交边界：
- `chore(app): unify mobile web build preparation`
- `chore(android-shell): align web bundle sync flow`
- `chore(ios-shell): align web bundle sync flow`

### Phase 3：补 Android 壳缺口，确保最新版手机版能力可运行

目标：
- 让 Android 壳不只是“能打开首页”，而是能跑最新手机版能力

执行项：
- 补齐并验证原生权限：
  - `CAMERA`
  - `RECORD_AUDIO`
  - 如有必要，相关运行时请求链路
- 检查以下能力在 Android 真机/模拟器上的可用性：
  - 图片选择
  - 本地通知
  - 推送点击恢复
  - 安全存储
  - 外链与分享
  - 语音输入
  - 视频通话本地摄像头预览
- 复核 `android-shell.config.json` / `android-shell.config.local.json` 的运行时注入是否覆盖最新入口需求

完成标准：
- Web 手机版新增的原生依赖能力不在 Android 上降级失效
- `pnpm android:doctor`
- `pnpm android:sync`
- `pnpm android:apk`
  这三条链路至少能稳定走通

建议提交边界：
- `feat(android-shell): align permissions with mobile web runtime`
- `feat(android-shell): finish mobile bridge parity`

### Phase 4：补 iOS 壳缺口，收口到“可持续维护”的状态

目标：
- 让 iOS 壳真正承接最新版 Web 手机版，而不是停在“模板接入中”

执行项：
- 将 `xcode-template/AppDelegatePush.example.swift` 中需要的逻辑并入真实 `apps/ios-shell/ios/App/App/AppDelegate.swift`
  - APNs 注册
  - push token 缓存到 `YinjiePushToken`
  - 通知点击落点缓存
- 收口 `Info.plist` 注入与样例文件：
  - 运行时注入字段
  - 相机权限文案
  - 麦克风权限文案
- 处理 `ios:configure` 的覆盖风险：
  - 要么只复制缺失文件
  - 要么将真实实现与 stub 分离清楚
- 更新 `apps/ios-shell/README.md`，避免文档继续误导为“只有骨架”

完成标准：
- `pnpm ios:doctor` 的输出与真实工程状态一致
- `YINJIE_IOS_CORE_API_BASE_URL=... pnpm ios:sync` 可稳定产出最新 Web 包
- `pnpm ios:configure` 不会误覆盖真实 plugin
- 在 macOS + Xcode 环境下可继续完成编译与真机验证

建议提交边界：
- `feat(ios-shell): align app delegate with push bridge contract`
- `feat(ios-shell): align runtime and privacy config`
- `docs(ios-shell): refresh current integration guide`

### Phase 5：做一次“手机版功能回归”而不是只看构建成功

目标：
- 确认更新到 Android / iOS 的不是空壳，而是最新版手机版真实可用

建议回归范围：
- 世界入口：
  - `splash`
  - `setup`
  - `welcome`
- 消息主链路：
  - `tabs/chat`
  - 单聊页
  - 群聊页
  - 聊天详情页
- 发现 / 通讯录 / 我
- 搜一搜
- 朋友圈 / 广场动态 / 视频号
- 图片选择、系统分享、外链打开
- 本地通知与通知点击回跳
- 语音输入
- AI 语音通话
- AI 数字人视频通话
- 群语音 / 群视频通话

完成标准：
- 不是“页面能打开”，而是关键交互不因为原生壳缺口报废

## 推荐执行顺序

1. 先做 Phase 1，出移动壳能力矩阵
2. 再做 Phase 2，统一同步链路
3. 先补 Android，再补 iOS
4. 最后做一轮真机回归与文档收口

原因：
- Android 当前完成度更高，先收掉一侧可以更快验证 Web 手机版的同步口径
- iOS 仍受 macOS / Xcode 环境约束，适合放在第二段处理

## 预计提交拆分

1. `docs(plan): add mobile web to android ios sync plan`
2. `chore(app): unify mobile shell web build flow`
3. `feat(android-shell): align permissions and bridge parity`
4. `feat(ios-shell): align runtime push and privacy integration`
5. `docs(mobile): refresh android ios sync runbook`

## 风险与阻塞

- 当前工作树里已有未提交改动：
  - `apps/app/src/features/desktop/chat/desktop-group-member-picker.tsx`
  - 后续执行时不能误覆盖
- iOS 最终验证依赖 macOS + Xcode，本机若不是该环境，只能先把仓库侧同步链路收口
- Push 最终可用性还依赖：
  - Apple 开发者配置
  - APNs / Firebase 等证书与平台设置
- 语音 / 视频相关功能不仅依赖 Web 代码，还依赖原生权限与 WebView 实际行为，不能只靠 `build` 判断完成

## 本轮规划结论

- 这项工作不应理解成“把 Web 手机版代码复制到 Android 和 iOS”
- 正确做法是：
  - 继续以 `apps/app` 作为唯一业务前端
  - 补齐 Android / iOS 原生壳与 Web 手机版之间的运行时契约
  - 再通过统一同步脚本把最新版手机版产物打进两个壳
