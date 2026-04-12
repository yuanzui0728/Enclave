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

## 微信参照基线（2026-04-12 检索）

说明：
- 公开可稳定检索到的官方来源，主要能确认 WeChat 当前公开功能面、版本节奏和平台差异
- 更细的手势、转场、权限前置文案、弹层密度等交互细节，仍需要在真机上补一次实际录屏对照
- 下述“遇到差异时怎么做”的规则，是基于这些官方来源和平台官方规范做出的执行推断

已确认的公开基线：
- iOS App Store 页面当前显示：
  - `Version 8.0.70`
  - 日期为 `Mar 21, 2026`
  - 公开功能面包括：
    - 文本 / 图片 / 语音 / 视频 / 位置消息
    - 最多 `500` 人群聊
    - 最多 `15` 人群视频
    - `Moments`
    - `Official Accounts`
    - `Mini Programs`
    - `Easy Mode`
- Android Google Play 页面当前显示：
  - `Updated on Apr 10, 2026`
  - `What's New in WeChat V8.0.69`
  - 公开功能面包括：
    - 文本 / 图片 / 语音 / 视频 / 位置消息
    - 最多 `500` 人群聊
    - 最多 `9` 人群视频
    - `Moments`
    - `Status`
    - `Channels`
    - `Official Accounts`
    - `Mini Programs`
    - `Custom Stickers`

从这组基线可以得到两个执行判断：
- 微信在 iOS / Android 上保持的是“功能面大体一致”，不是“所有交互细节完全一致”
- 微信自己也接受平台差异：
  - 例如群视频上限在官方商店文案里就不一致
  - 所以隐界移动壳不应追求 Web / Android / iOS 绝对一模一样，而应追求：
    - 核心能力一致
    - 关键路径一致
    - 平台交互合理且像该平台上的微信

## 差异决策总则

### Rule 1：先统一语义，再允许交互分流

- 同一个能力在三端必须先保证：
  - 路由语义一致
  - 数据契约一致
  - 状态变更一致
  - 用户结果一致
- 在这个前提下，允许：
  - Android 交互更偏 Material / 系统返回逻辑
  - iOS 交互更偏导航栏 / 边缘返回 / 原生弹层
  - Web 壳版维持同一业务骨架，但不强迫模拟所有原生细节

### Rule 2：遇到系统级冲突时，平台规则优先，微信做表现参考

- 适用于：
  - 权限
  - 通知
  - 分享
  - 外链跳转
  - 摄像头 / 麦克风
  - 文件读写
  - 后台 / 前台恢复
- 判定顺序固定为：
  - 平台系统限制
  - 目标平台上的微信常见做法
  - 隐界现有 Web 交互

### Rule 3：微信 iOS 和微信 Android 不同，就允许隐界 iOS / Android 不同

- 不做“跨平台强行统一 UI”
- 只统一这些内容：
  - 信息架构
  - 功能入口命名
  - 用户心智
  - 主路径结果
- 允许不同这些内容：
  - 返回手势
  - 权限请求时机
  - Action Sheet / Bottom Sheet 形态
  - 通知样式落点
  - 键盘顶起与安全区细节

### Rule 4：Web 壳做不到原生效果时，采用“微信式降级”而不是“桌面网页式替代”

- 优先保留主任务完成能力
- 不优先追求视觉等价
- 降级表现应尽量像微信移动端常见做法：
  - 底部动作面板
  - 明确的“去设置开启”提示
  - 明确的“暂不支持此能力”而不是静默失败
  - 从当前聊天 / 当前场景回跳，而不是跳到陌生页面

### Rule 5：所有差异都必须落成记录，不靠临场判断

- 每个差异项都要写入执行对照表：
  - 功能
  - Web 当前行为
  - 微信 Android 参考处理
  - 微信 iOS 参考处理
  - 隐界 Android 决策
  - 隐界 iOS 决策
  - 负责人
  - 是否阻塞发版

## 差异处理矩阵

### 1. 导航、返回、进入方式

目标：
- 用户从消息、通知、分享、外链进入任意页面后，都能按平台直觉返回

执行规则：
- Android：
  - 优先跟系统返回键与侧滑返回保持一致
  - `MainActivity` / 路由栈要支持通知点击、分享回跳、冷启动落点恢复
  - 顶部返回按钮是冗余保障，不是唯一出口
- iOS：
  - 优先跟导航栏返回和左缘手势保持一致
  - 模态页优先支持下拉关闭或明确关闭按钮
  - 不做 Android 式“系统返回优先”心智
- Web 壳：
  - 保证浏览器历史栈与应用内返回不打架
  - 不把浏览器后退变成随机离开应用

微信参照判断：
- 若微信 Android 与 iOS 的返回方式不同，隐界就分别跟各自平台
- 不追求“一个页面三端按钮摆位完全一致”

准备动作：
- 盘点所有来自外部入口的路由：
  - 通知点击
  - 本地通知
  - 分享回流
  - 深链
  - 外链打开后回跳
- 单独检查这些页：
  - `chat`
  - `group`
  - `official-account-article`
  - `chat-voice-call`
  - `chat-video-call`
  - `group-voice-call`
  - `group-video-call`

### 2. 输入栏、键盘、安全区

目标：
- 输入体验对齐微信移动端，而不是桌面网页聊天框

执行规则：
- Android：
  - 以键盘顶起后的稳定布局为主
  - 输入栏、语音按钮、加号面板、表情面板必须跟随 IME 变化
  - 优先解决遮挡、跳闪、滚动错位
- iOS：
  - 以安全区、底部 Home Indicator、键盘跟手感为主
  - 面板高度、圆角、间距更偏 iOS 微信风格
  - 下方弹层更像 sheet，不像抽屉
- Web 壳：
  - 禁止依赖 hover
  - 禁止出现桌面式右键、焦点样式、输入框固定高度假设

微信参照判断：
- 语音 / 键盘切换、加号入口、表情入口应保持微信式主路径
- 若 Web 当前实现与移动端微信心智冲突，以微信为准，不以网页现状为准

准备动作：
- 重点审计：
  - `apps/app/src/components/chat-composer.tsx`
  - `apps/app/src/components/mobile-shell.tsx`
  - `apps/app/src/index.css`
  - `apps/app/src/features/chat/conversation-thread-panel.tsx`
  - `apps/app/src/features/chat/group-chat-thread-panel.tsx`
- 单列 3 类问题：
  - 键盘遮挡
  - 安全区缺口
  - 面板开合抖动

### 3. 图片、相册、拍照、录音、摄像头

目标：
- 所有媒体相关能力都按移动原生习惯完成，不让 WebView 成为短板

执行规则：
- Android：
  - 图片优先走系统选取器 / Document Picker
  - `CAMERA` / `RECORD_AUDIO` 权限按动作触发时请求
  - WebView 侧若触发 `PermissionRequest`，只能按需授予具体资源
- iOS：
  - 图片优先走系统照片选择器
  - 相机 / 麦克风权限请求必须与具体动作强绑定
  - 首次请求前要有一层微信式前置解释文案
- Web 壳：
  - 能调用原生桥就走原生桥
  - 不能走桥时再退回浏览器能力

微信参照判断：
- 权限不是启动即弹，而是在用户点“发语音 / 视频通话 / 拍照 / 录音”时再弹
- 被拒绝后不是死掉，而是给出“去设置开启”路径

准备动作：
- Android 补齐并验证：
  - `android.permission.CAMERA`
  - `android.permission.RECORD_AUDIO`
- iOS 补齐并验证：
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription`
- 检查这些实现点：
  - `apps/app/src/features/chat/use-speech-input.ts`
  - `apps/app/src/features/chat/use-self-camera-preview.ts`
  - `apps/app/src/runtime/mobile-bridge.ts`
  - `apps/ios-shell/ios/App/App/Plugins/YinjieMobileBridgePlugin.swift`
  - `apps/android-shell/android/app/src/main/java/com/yinjie/mobile/YinjieMobileBridgePlugin.java`

### 4. 通知、本地提醒、冷启动恢复

目标：
- 通知申请时机、通知呈现、点击后落点恢复，都像微信移动端而不是像网页推送 demo

执行规则：
- Android：
  - Android 13+ 明确走 `POST_NOTIFICATIONS` 运行时权限
  - 不在首次启动无上下文弹权限
  - 在用户触发提醒相关能力时再申请
  - 点击通知必须恢复到准确场景
- iOS：
  - 申请通知权限必须“有上下文”
  - 需要和系统通知设置、Focus 行为兼容
  - 点击通知优先回到对应会话 / 群聊 / 路由
- Web 壳：
  - 浏览器通知只作为 fallback
  - 不以浏览器通知行为倒逼原生端

微信参照判断：
- 消息提醒属于“需要时再开”的能力，不是冷启动强推权限
- 进入会话后的回跳要准确，不能把所有通知都落回消息列表首页

准备动作：
- 统一 launch target 契约，避免 Android / iOS 结构继续分叉
- 核查：
  - `apps/app/src/features/shell/mobile-notification-launch-bridge.tsx`
  - `apps/app/src/runtime/mobile-bridge.ts`
  - `apps/android-shell/android/app/src/main/java/com/yinjie/mobile/YinjieFirebaseMessagingService.java`
  - `apps/ios-shell/ios/App/App/AppDelegate.swift`

### 5. 分享、外链、文件打开

目标：
- 分享和打开外链时更像微信的移动端处理，而不是桌面浏览器跳新标签

执行规则：
- Android：
  - 走系统 chooser
  - 文件或图片分享走 `content://` / `FileProvider` 兼容思路
- iOS：
  - 走系统 share sheet
  - 外链用系统浏览器打开，不在 WebView 里硬塞第三方网页
- Web 壳：
  - `navigator.share` 可用时用，否则降级
  - 外链退化为新窗口打开

微信参照判断：
- 入口是 App 内 action sheet
- 最终动作交给系统分享能力
- 分享完成后仍能回到当前场景

准备动作：
- 检查：
  - `openExternalUrl`
  - `shareWithNativeShell`
  - 图片 / 文件保存路径与返回文案

### 6. 语音通话、视频通话、群通话

目标：
- 先保证能稳定开始、持续、结束和回跳，再追视觉还原

执行规则：
- Android：
  - 先解权限、前后台切换、通知/任务栈问题
  - UI 可次优，但通话主路径必须稳
- iOS：
  - 先解麦克风 / 摄像头授权与安全区
  - 界面层更偏沉浸式，操作区更收束
- Web 壳：
  - 若做不到原生级后台保活，就明确维持前台会话模式
  - 不伪装成已具备系统通话整合

微信参照判断：
- 微信里通话是高优先级场景
- 这里优先学的是：
  - 入口简单
  - 失败可解释
  - 回到聊天自然
- 不是先追完全一致的铃声/系统来电形态

准备动作：
- 重点校验：
  - 麦克风权限
  - 摄像头权限
  - 中途切后台再回来
  - 通话中收到通知
  - 结束后回到正确会话

### 7. 发现、公众号、视频号、小程序等内容页

目标：
- 这些不是原生桥重灾区，但容易因为滚动、手势、返回逻辑而“像 H5 页面”

执行规则：
- Android / iOS：
  - 主入口、二级页、详情页层级要清晰
  - 不要出现桌面站式大浮层、悬浮 hover 交互
  - 保证滚动容器、顶部栏、回跳动作稳定
- Web 壳：
  - 只保留移动端信息密度
  - 避免桌面布局残留

微信参照判断：
- 这些页面更应参考微信的信息架构和跳转层级
- 不需要强行复制微信的具体视觉装饰

## 执行前资产准备

### 环境准备

- Android：
  - Android Studio
  - 至少一个 API 33+ 模拟器
  - 至少一台真机
- iOS：
  - macOS
  - Xcode
  - 至少一台可安装调试包的 iPhone
- 服务：
  - 可访问的远程 `apiBaseUrl`
  - 可访问的 `socketBaseUrl`
  - 推送与通知测试环境

### 对照准备

- 准备两台参考设备：
  - 安装当前可用微信 iOS 版本
  - 安装当前可用微信 Android 版本
- 为下列场景各录一段 15-30 秒对照视频：
  - 单聊输入
  - 发图
  - 长按消息
  - 通知点击回到会话
  - 语音权限申请
  - 视频权限申请
  - 公众号文章进入与返回

### 文档准备

- 在执行期新增一份“移动端差异对照表”，字段固定为：
  - 场景
  - Web 当前
  - 微信 Android
  - 微信 iOS
  - 隐界 Android 方案
  - 隐界 iOS 方案
  - 是否必须本轮完成

## 真正开工时的任务拆分

### P0：不解决就无法说“已同步到 Android / iOS”

- 统一移动 Web 构建与同步链路
- Android 权限补齐：
  - `CAMERA`
  - `RECORD_AUDIO`
- iOS 权限与运行时字段补齐：
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription`
  - `YinjieApiBaseUrl`
  - `YinjieSocketBaseUrl`
  - `YinjieEnvironment`
  - `YinjiePublicAppName`
- 通知申请与点击回跳收口
- 安全存储、分享、图片选取桥接核验

### P1：影响体验，需按微信对齐

- 键盘 / 安全区 / 底部面板稳定性
- 聊天页长按、加号、表情、语音切换体验
- 搜一搜、发现、公众号、视频号等页面的移动层级与回跳
- 语音 / 视频通话前台体验

### P2：收尾与发版准备

- README / doctor / runbook 收口
- 权限文案统一
- Accessibility / Easy Mode 风格补偿
- 真机回归记录沉淀

## 验收口径

只有同时满足下面几条，才算“Web 手机版已更新到 Android 和 iOS”：

- 最新 `apps/app` 产物能稳定进入两个壳
- Android / iOS 的关键原生能力没有因壳缺口失效
- 关键路径交互在目标平台上不违背微信式心智
- 权限、通知、分享、媒体、回跳四大类系统能力均已验证
- 差异项都有明确记录，不存在“这个先随便做，后面再看”的无主项

## 外部参考链接

- WeChat iOS App Store：
  - https://apps.apple.com/us/app/wechat/id414478124
- WeChat Android Google Play：
  - https://play.google.com/store/apps/details?hl=en_US&id=com.tencent.mm
- Apple Support：iPhone 硬件权限说明
  - https://support.apple.com/en-afri/guide/iphone/iph168c4bbd5/ios
- Apple Developer：通知权限应在上下文中申请
  - https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications
- Apple Support：按 App 管理通知
  - https://support.apple.com/en-us/120681
- Android Developers：通知运行时权限
  - https://developer.android.com/develop/ui/views/notifications/notification-permission
- Android Developers：运行时权限请求
  - https://developer.android.com/guide/topics/permissions/requesting
- Android Developers：WebView `PermissionRequest`
  - https://developer.android.com/reference/android/webkit/PermissionRequest

## 补充结论

- 接下来不是直接“开始同步代码”，而是先建立一套稳定执行准则：
  - 功能统一
  - 平台分流
  - 微信参考
  - 系统优先
- 只要这套准则先立住，后面做 Android / iOS 适配时就不会陷入：
  - 一边修一边改口径
  - Web 要求、原生限制、微信心智三者互相打架

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
