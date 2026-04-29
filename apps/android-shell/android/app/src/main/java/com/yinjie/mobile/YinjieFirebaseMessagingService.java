package com.yinjie.mobile;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class YinjieFirebaseMessagingService extends FirebaseMessagingService {
    private static final String PREFERENCES_NAME = "com.yinjie.mobile_bridge";
    private static final String PUSH_TOKEN_KEY = "push_token";
    private static final String CHANNEL_ID = YinjieNotificationChannels.MESSAGES_CHANNEL_ID;
    private static final String EXTRA_TARGET_KIND = "yinjie_target_kind";
    private static final String EXTRA_TARGET_ROUTE = "yinjie_target_route";
    private static final String EXTRA_CONVERSATION_ID = "yinjie_conversation_id";
    private static final String EXTRA_GROUP_ID = "yinjie_group_id";
    private static final String EXTRA_TARGET_SOURCE = "yinjie_target_source";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        if (token == null || token.trim().isEmpty()) {
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        preferences.edit().putString(PUSH_TOKEN_KEY, token.trim()).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        showNotification(remoteMessage);
    }

    private void showNotification(RemoteMessage remoteMessage) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        YinjieNotificationChannels.createMessagesChannelIfNeeded(this);

        String title = remoteMessage.getNotification() != null ? remoteMessage.getNotification().getTitle() : null;
        String body = remoteMessage.getNotification() != null ? remoteMessage.getNotification().getBody() : null;

        if (title == null || title.trim().isEmpty()) {
            title = remoteMessage.getData().getOrDefault(
                "title",
                getString(R.string.notification_default_title)
            );
        }
        if (body == null || body.trim().isEmpty()) {
            body = remoteMessage.getData().getOrDefault(
                "body",
                getString(R.string.notification_default_body)
            );
        }

        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        applyLaunchTargetExtras(launchIntent, remoteMessage);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            1001,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        NotificationManagerCompat.from(this).notify((int) System.currentTimeMillis(), builder.build());
    }

    private void applyLaunchTargetExtras(Intent intent, RemoteMessage remoteMessage) {
        if (intent == null || remoteMessage == null) {
            return;
        }

        String route = normalize(remoteMessage.getData().get("route"));
        String conversationId = normalize(remoteMessage.getData().get("conversationId"));
        String groupId = normalize(remoteMessage.getData().get("groupId"));
        String kind = normalize(remoteMessage.getData().get("kind"));

        if (kind == null) {
            if (conversationId != null) {
                kind = "conversation";
            } else if (groupId != null) {
                kind = "group";
            } else {
                kind = "route";
            }
        }

        intent.putExtra(EXTRA_TARGET_KIND, kind);
        intent.putExtra(EXTRA_TARGET_SOURCE, "push");

        if (route != null) {
            intent.putExtra(EXTRA_TARGET_ROUTE, route);
        } else if ("route".equals(kind)) {
            intent.putExtra(EXTRA_TARGET_ROUTE, "/tabs/chat");
        }

        if (conversationId != null) {
            intent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        }

        if (groupId != null) {
            intent.putExtra(EXTRA_GROUP_ID, groupId);
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
