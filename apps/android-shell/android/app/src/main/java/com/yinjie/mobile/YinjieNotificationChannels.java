package com.yinjie.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

final class YinjieNotificationChannels {
    static final String MESSAGES_CHANNEL_ID = "yinjie_messages";

    private YinjieNotificationChannels() {}

    static void createMessagesChannelIfNeeded(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        String channelName = context.getString(R.string.notification_channel_name);
        String channelDescription = context.getString(R.string.notification_channel_description);
        NotificationChannel channel = manager.getNotificationChannel(MESSAGES_CHANNEL_ID);

        if (channel == null) {
            channel = new NotificationChannel(
                MESSAGES_CHANNEL_ID,
                channelName,
                NotificationManager.IMPORTANCE_HIGH
            );
        } else {
            channel.setName(channelName);
        }

        channel.setDescription(channelDescription);
        manager.createNotificationChannel(channel);
    }
}
