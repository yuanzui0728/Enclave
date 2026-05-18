# Android Emulator Shakedown Blind Spots

历史上 Android Shell 跑过 38+ 轮**真机走查**（R1..R36 + 新一轮 R1..R2）；
本节 R3 / R4 / R5 是在 Linux 上 Android Emulator（API 36, x86_64,
Google APIs Play Store, KVM 加速）跑出来的「模拟器走查」补遗。

Emulator 能复现绝大多数 WebView / Activity / Permission / Locale /
Manifest 层的问题，但下列**真机才能挖出来**的盲区，模拟器一律测不到。

未来上真机的第一轮，照下列清单去打靶：

## 1. FCM 真实推送链路

- 模拟器有 Google APIs Play Store 镜像理论上能拿 FCM token，但需要
  Firebase 项目 + `google-services.json` 才能注册（**现在 ship 状态：
  google-services.json 留空**，build.gradle conditional 跳过 plugin）。
- 真机要专门验：
  - `YinjieMobileBridge.getPushToken()` 在新装 + 网络通 + 没禁用 Google Play
    Services 的设备上返回非空 token；
  - 服务端发一条 data + notification 消息到该 token 后：
    - app foreground：进 `YinjieFirebaseMessagingService.onMessageReceived`，
      `yinjie_messages` channel 弹本地通知（R22 修过 channel 必须在 Application.onCreate
      就建）；
    - app background：FCM SDK 直接走系统通知栏（**不进 onMessageReceived**，
      R14 修过），点击后 launchIntent extras 被 `cacheLaunchTarget` 解析，
      `getPendingLaunchTarget` 返出 `{conversationId|groupId|route}`，
      JS 端正确路由（R8 / R14 / R19-22 / R24 / R30 全是这条链路上的 bug）；
    - app 整个被 kill：FCM SDK 唤起 launcher activity，同上路由；
- 真机还要验 OEM 自定义 push (华为 HMS / 小米 MiPush / OPPO ColorOS) 对
  FCM 的拦截行为 —— Google FCM 在国内 OEM 上默认走「白名单」，没在白名单
  的应用 background push 直接丢，FCM SDK 不报错。

## 2. OEM 自带相机 / 文件选择器行为

R33 修过 captureImage 在 MIUI / EMUI / OxygenOS 自带相机走 FileProvider URI
时 SecurityException —— 这是因为这些 OEM 的相机 app 拿到 `EXTRA_OUTPUT`
URI 后 fork 子进程写文件，子进程不自动继承 intent flag grant。

模拟器自带的 AOSP Camera 行为正常，**测不到** OEM 差异。真机第一轮要
覆盖：

- Xiaomi Hyper OS / MIUI 14 → 相机
- Huawei HarmonyOS NEXT → 相机
- OPPO ColorOS 15 → 相机
- Samsung One UI 7 → 相机 + Knox 容器内
- Vivo OriginOS 5 → 相机
- 三摄 ↔ 前后摄切换是否回调 `pickImagesResult` /
  `captureImageResult` 正确路径

文件选择器同款：DocumentsUI 在不同 OEM 上的实现不一，特别是「最近文件」/
「下载」/「文档」三个根目录的 `content://` URI 是否能被
`takePersistableUriPermission` 持久化（R25 修过）。

## 3. SIM-required 系统 app

R11 修过 `openExternalUrl` 对 `tel:` / `mailto:` / `sms:` 不要 addCategory(BROWSABLE)。

模拟器**没有 dialer / 没有 sms app**，所以这条链路无法 end-to-end 测：

- 模拟器只能看到 `startActivity` 不抛 ActivityNotFoundException；
- 真机要验：链接点开后实际跳到拨号盘 / 短信草稿 / 邮件草稿，且号码 /
  收件人 / 主题字段正确填上（不止 scheme 解析对，extras 也要塞对）。

`<queries>` 声明的 5 个 scheme（tel/mailto/smsto/SEND/VIEW）也要在真机
逐一回归 —— 真机上某些 ROM 出厂没装 SMS app（如华为部分设备），点 sms:
会回退到「请安装短信应用」对话框，UI 要友好处理这条路径。

## 4. Pre-API-25 兼容

R35 修过 `Map.getOrDefault` —— Java 8 default method 在 API 23 (Android 6.0)
系统 Map 实现里不存在，FCM 推送到达直接 NoSuchMethodError 把 service 崩掉。

我们的 `minSdkVersion = 23`，但**模拟器只有 API 36** 一种 image，跑不到
API 23/24/25 的运行时 bug。真机第一轮务必拉一台 Android 6.0 / 7.0 / 7.1
设备过一遍：

- 启动 → 进登录 → 至少跑一遍 FCM token 注册路径；
- 三个原生 plugin 每个 `@PluginMethod` 都过一遍（特别是有
  `Map.getOrDefault` / `Optional.orElseThrow` / `List.of` 这类 Java 8+
  default method / Java 9+ static factory 的位置）。

## 5. 键盘 OEM 默认 windowSoftInputMode

R36 修过 MainActivity 必须显式写 `windowSoftInputMode="adjustResize"`，
否则 Samsung One UI / Huawei HarmonyOS App / 早期 MIUI 默认 `adjustPan`，
Vivo OriginOS / OPPO ColorOS 部分版本默认 `adjustNothing`，**键盘弹起盖住
输入框**。

模拟器跑的是 AOSP，默认行为已经是 adjustResize，**测不到** OEM 差异。
真机第一轮要在每家 OEM 至少一台机上验：

- 进单聊 → tap composer textarea → 软键盘弹起 → 输入框停在键盘正上方
  不被遮挡；
- 单聊有图片 / 卡片 / 通话浮窗时输入框仍正确浮出；
- 切换 OEM 自带键盘（Sogou / Baidu / Gboard）时表现一致。

## 6. 生物识别 / 安全屏

模拟器没指纹 / 没 Face Unlock / 没系统级 PIN 流。如果未来加「打开 app
需要指纹」/ 「敏感操作二次认证」这类需求，必须真机覆盖。

## 7. 网络 + 运营商行为

- 模拟器走 NAT，IP 是 10.0.2.x，访问 host 用 10.0.2.2；它**无法**复现
  真机的运营商 IP、运营商 DNS、4G ↔ Wi-Fi 切换、信号弱时 TCP 慢启动等。
- vicp.fun 反代服务在国内某些运营商上偶发被 reset / DNS 污染，emulator
  跑在 Linux box 上不会触发；真机带 4G 卡的第一轮务必拨测过 socket /
  HTTP / cloud-api 三条链路在数据流量下的连通性。
- HTTPS 证书：vicp.fun 用的自签 / Let's Encrypt 证书在某些定制 ROM
  自带证书库里可能没有，需要真机验。

## 8. 视频通话 / 音频

- 模拟器的虚拟相机出的是 RGB 测试卡，色彩 / 帧率不真实；
- 麦克风采的是 host 上的合成音；
- 视频通话 / 摇一摇 voice / 录音 / 录像这些路径在模拟器上**能验「不崩」
  但验不到「真实可用」**。真机第一轮要拿耳机 + 真摄像头跑一遍。

## 9. 真实数据集

我跑的 emulator session 用的是历史遗留的 `yz` 账号缓存（secure storage
里残留的 owner 状态），所以 cold-start 时直接跳过登录进了聊天列表 —— 在
release APK uninstall 重装后才看到「Connect your world」登录页（cache
被一并 wipe）。

真机第一轮要：

- 新 Google 账号注册 / 手机号验证码登录路径完整跑一遍；
- 测试号 / 普通号 / 已 banned 号 三类账号各跑一次 cold-start。

---

后续真机走查的 commit 命名继续 `fix(android-shell): 真机走查 Round N — ...`
（接 R36 后），模拟器走查继续 `fix(android-shell): 模拟器走查 Round N — ...`
（新一轮，接 R5 后）。
