package com.yinjie.mobile;

import android.app.Application;

public class YinjieApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Round 22：背景 FCM 通知由 SDK 直接走 Manifest 里 default_notification_channel_id
        // = yinjie_messages（Round 19 加的 meta-data）去 notify()。但 channel 之前只在
        // 真正第一次 showNotification / showLocalNotification 时按需 create —— 新装用户
        // 第一条推送如果在打开 app 之前到达，channel 不存在，Android 8+ 会把通知 drop
        // 或路由到一个 SDK 自建的低优先级 channel。在 Application.onCreate 里提前 create，
        // 让 process 启动到 service handleIntent 之间就准备好。
        YinjieNotificationChannels.createMessagesChannelIfNeeded(this);
    }
}
