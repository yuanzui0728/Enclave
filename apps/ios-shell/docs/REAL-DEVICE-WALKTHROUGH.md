# iOS 真机走查清单

本清单覆盖隐界 APP iOS 壳从冷启动到所有核心交互的端到端走查。用户在 Mac 上跑出 `.ipa` 装到真机后，按 7 块共 30 项依次过一遍，把发现的问题记录到文末"问题记录区"。

**前提**：
- 已按 `MAC-IPA-RELEASE.md` 出 `.ipa` 并装机
- 测试账号：`yuanzui0728@gmail.com`（云端 wiki/world 共用，避免污染生产数据）
- 测试设备至少覆盖一台带刘海机型（iPhone 13/14/15）+ 一台 iPad（验证强制手机布局）
- iOS 版本范围：14.0（最低支持）/ 当前最新（17.x 或 18.x）

---

## 1. 冷启与登录（4 项）

| # | 走查点 | 关键验证 |
|---|---|---|
| 1.1 | [ ] 冷启 splash 颜色与首屏过渡 | 启动画面深蓝 `#070c14`，无白闪、无黑屏卡顿；splash 1 秒内淡出（`SplashScreen.launchShowDuration=1000`） |
| 1.2 | [ ] 中/英/日/韩 4 语切换 | 系统语言切到 zh-Hans / en / ja / ko 后冷启，UI 文案 + 权限弹窗文案（来自 InfoPlist.strings）随之切换；zh-SG/zh-Hant 规范化到 zh-Hans |
| 1.3 | [ ] 登录 → 退出 → 重登 | 输入云端账号登录成功；退出后回到 splash；重登能恢复会话 |
| 1.4 | [ ] Token 过期 401 自动登出 | 模拟 cloud-api 401（删 keychain token / 等 token 过期）→ 自动回 splash 并弹「会话过期」alert（验 `splash-page.tsx` 的 `isCloudSessionInactivityError`） |

---

## 2. 单聊（7 项）

| # | 走查点 | 关键验证 |
|---|---|---|
| 2.1 | [ ] 文本发送/接收 | 双向文本即时到达，时间戳 / 已读状态正确 |
| 2.2 | [ ] 表情/emoji | iOS 系统 emoji 渲染正确，不出豆腐块；自定义表情贴图加载 |
| 2.3 | [ ] PHPicker 选 1/3/9 张图 | 选 1 张、3 张、最大 9 张都能发送；HEIC 自动转 JPEG（验 `pickImages` 的 `preferredAssetRepresentationMode=.compatible`） |
| 2.4 | [ ] 拍照权限流程 | 第一次拒相机权限 → 二次点拍照 → 应跳「权限引导」让用户去 Settings → `openAppSettings` 打开系统设置 → 开启后回 app 重试 `captureImage` 成功 |
| 2.5 | [ ] 麦克风权限流程 | 同上，先拒 → 引导去 Settings → 开启后录音成功 |
| 2.6 | [ ] 文件分享 + 预览 | 选 PDF/Excel/zip 发送；接收侧点击预览（验 `UIDocumentInteractionController` + iPad popover 居中无箭头） |
| 2.7 | [ ] 长按消息菜单 | 长按消息出现「复制 / 转发 / 删除」菜单；复制走 `writeClipboardText`；转发拉起 share sheet |

---

## 3. 群聊（4 项）

| # | 走查点 | 关键验证 |
|---|---|---|
| 3.1 | [ ] 创建群 | 选 2+ 联系人创建群聊，群名生成正确，所有成员都能收到首条消息 |
| 3.2 | [ ] 添加/移除成员 | 群主从群信息页加人 / 踢人，所有成员侧端 UI 同步更新 |
| 3.3 | [ ] 群公告 | 编辑群公告，所有成员收到系统消息推送 |
| 3.4 | [ ] 群内 @ 提醒 | @ 某人发消息，被 @ 的人侧收到「有人 @ 你」高亮 |

---

## 4. 推送通知（5 项）

> 推送链路：`AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken` → `UserDefaults["YinjiePushToken"]` → `NotificationCenter.post("YinjiePushTokenChanged")` → `YinjieMobileBridgePlugin.load()` 监听 → `notifyListeners("pushTokenChanged")` → JS `push-token-sync.ts` → POST cloud-api。

| # | 走查点 | 关键验证 |
|---|---|---|
| 4.1 | [ ] 前台 push → banner → 点击落点 | App 处于聊天列表/其它会话时收到 push，弹横幅；点击横幅跳到对应会话（验 `pendingLaunchTargetChanged` 事件桥） |
| 4.2 | [ ] 后台 push → 通知中心 → 点击 | App 切后台后收到 push，下拉通知中心点击；冷启时落点正确 |
| 4.3 | [ ] 锁屏 push → 唤醒 | 锁屏状态下收到 push，亮屏 → 滑动通知 → 解锁直接落到会话 |
| 4.4 | [ ] 卸载重装 → 新 token 注册 | 卸载 App 重新装机，首次开启接受推送权限后，新 device token 自动 POST 到 cloud-api（验 `push-token-sync` + `pushTokenChanged` listener） |
| 4.5 | [ ] Settings 切换权限后切回 | Settings → App → 通知 → 关闭 → 切回 app，state="denied"；再 Settings 开启 → 切回 app，触发 re-register（验 `applicationDidBecomeActive` 的 not-granted → granted edge 检测，避免每次切回都冗余 register） |

---

## 5. 权限弹窗与外链 / 深链（3 项）

| # | 走查点 | 关键验证 |
|---|---|---|
| 5.1 | [ ] 权限弹窗文案本地化 | 第一次拉起相机/相册/麦克风/通知权限，弹窗文案是当前系统语言版本（来自对应 `<locale>.lproj/InfoPlist.strings`） |
| 5.2 | [ ] Universal Link 唤起 | 若配了 `associatedDomain`，Safari 打开匹配的 https URL 应能直接唤起 app 并落到对应路由（验 `AppDelegate.application(_:continue:)` + `@capacitor/app` 的 `appUrlOpen` 事件） |
| 5.3 | [ ] 外链 short-tap vs long-press | 聊天里点带 http(s) 链接的消息：short-tap 走 `openExternalUrl`（外部 Safari 打开）；long-press **不**弹 mini-Safari 预览（验 `capacitor.config.ts.ios.allowsLinkPreview=false`） |

---

## 6. 剪贴板（2 项）

| # | 走查点 | 关键验证 |
|---|---|---|
| 6.1 | [ ] 复制文本跨 app 粘贴 | 在隐界长按某条文本消息 → 复制 → 切到 Notes / iMessage / Safari 地址栏 → 粘贴出现原文（验 `writeClipboardText` → `UIPasteboard.general.string`） |
| 6.2 | [ ] 复制图片跨 app 粘贴 | 长按图片消息 → 复制 → 切到 Notes → 粘贴出现图片（验 `writeClipboardImage` → base64 decode → `UIImage` → `UIPasteboard.general.image`） |

---

## 7. 键盘 / 安全区 / 屏幕（5 项）

| # | 走查点 | 关键验证 |
|---|---|---|
| 7.1 | [ ] 键盘弹起不遮输入框 | 在单聊点击底部输入框，键盘弹起，输入框上移到键盘顶部（验 `--keyboard-inset` CSS var + Capacitor Keyboard `resize: "native"`） |
| 7.2 | [ ] 顶部安全区（刘海/灵动岛） | iPhone 14 Pro 以上灵动岛机型，顶部状态栏区域不被内容覆盖；status bar 文字深色（`StatusBar.style=dark`） |
| 7.3 | [ ] 底部安全区（home indicator） | 全面屏机型底部 home indicator 区域不挡 fixed bottom 元素（验 `env(safe-area-inset-bottom)` + `max(env(...), --keyboard-inset)`） |
| 7.4 | [ ] iPad 强制手机布局 | iPad 安装运行，UI 按 iPhone 竖屏渲染（验 `capacitor.config.ts.ios.preferredContentMode="mobile"`），不出现 split view 或 sidebar |
| 7.5 | [ ] 前后台切换 + Kill 重启 | 切后台再切回前台，badge 数清零（验 `applicationDidBecomeActive` 的 `setBadgeCount(0)`）；Kill 后重启冷启动 splash 正常，不卡黑屏 |

---

## 走查记录区

每发现一个问题记一条。修复后划掉，并在右侧填修复 commit SHA。

```
[日期] [设备] [iOS版本] [现象]
  复现步骤：
  期望：
  实际：
  影响范围：
  修复 commit：
```

### 模板示例

```
[2026-05-19] [iPhone 14 Pro] [iOS 17.4] [前台 push 点击后落点偏移]
  复现步骤：1. 打开聊天列表  2. 让另一账号给本号发消息  3. 收到 banner 点击
  期望：跳到对方会话
  实际：跳到上一个打开过的会话
  影响范围：前台 push 落点（4.1）
  修复 commit：（待修）
```

### 实际走查记录

<!-- 在此追加实际发现的问题 -->

---

## 走查后归档

走查全部通过后：
1. 把本文件的所有 `[ ]` 改成 `[x]`
2. 在文末"走查记录归档"区追加一行 `日期 / 走查人 / IPA 版本号 / 测试设备 / 走查结论`
3. commit：`docs(ios-shell): 真机走查完成 — v<version> on <date>`

### 走查记录归档

<!-- 历史走查记录 -->
