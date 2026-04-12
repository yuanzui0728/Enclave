package com.yinjie.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "YinjieMobileBridge",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class YinjieMobileBridgePlugin extends Plugin {
    private static final String PREFERENCES_NAME = "com.yinjie.mobile_bridge";
    private static final String PUSH_TOKEN_KEY = "push_token";
    private static final String LAUNCH_TARGET_KIND_KEY = "launch_target_kind";
    private static final String LAUNCH_TARGET_ROUTE_KEY = "launch_target_route";
    private static final String LAUNCH_TARGET_CONVERSATION_ID_KEY = "launch_target_conversation_id";
    private static final String LAUNCH_TARGET_GROUP_ID_KEY = "launch_target_group_id";
    private static final String LAUNCH_TARGET_SOURCE_KEY = "launch_target_source";
    private static final String EXTRA_TARGET_KIND = "yinjie_target_kind";
    private static final String EXTRA_TARGET_ROUTE = "yinjie_target_route";
    private static final String EXTRA_CONVERSATION_ID = "yinjie_conversation_id";
    private static final String EXTRA_GROUP_ID = "yinjie_group_id";
    private static final String EXTRA_TARGET_SOURCE = "yinjie_target_source";
    private static final String CHANNEL_ID = "yinjie_messages";
    private static final String CHANNEL_NAME = "隐界消息";

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = normalize(call.getString("url"));
        if (url == null) {
            call.reject("url is required");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("failed to open external url", exception);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("failed to open app settings", exception);
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        String title = normalize(call.getString("title"));
        String text = normalize(call.getString("text"));
        String url = normalize(call.getString("url"));

        StringBuilder payload = new StringBuilder();
        if (text != null) {
            payload.append(text);
        }
        if (url != null) {
            if (payload.length() > 0) {
                payload.append("\n");
            }
            payload.append(url);
        }

        if (payload.length() == 0) {
            call.reject("share payload is empty");
            return;
        }

        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType("text/plain");
        shareIntent.putExtra(Intent.EXTRA_TEXT, payload.toString());
        if (title != null) {
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
        }

        Intent chooser = Intent.createChooser(shareIntent, title != null ? title : "Share");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception exception) {
            call.reject("failed to open share sheet", exception);
        }
    }

    @PluginMethod
    public void pickImages(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");

        Boolean multiple = call.getBoolean("multiple");
        if (Boolean.TRUE.equals(multiple)) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        startActivityForResult(call, intent, "pickImagesResult");
    }

    @ActivityCallback
    private void pickImagesResult(PluginCall call, ActivityResult result) {
        JSObject response = new JSObject();
        JSArray assets = new JSArray();
        response.put("assets", assets);

        if (call == null) {
            return;
        }

        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.resolve(response);
            return;
        }

        Intent data = result.getData();
        if (data.getClipData() != null) {
            for (int index = 0; index < data.getClipData().getItemCount(); index += 1) {
                Uri uri = data.getClipData().getItemAt(index).getUri();
                assets.put(buildAsset(uri));
            }
        } else if (data.getData() != null) {
            assets.put(buildAsset(data.getData()));
        }

        call.resolve(response);
    }

    @PluginMethod
    public void getPushToken(PluginCall call) {
        String token = getPreferences().getString(PUSH_TOKEN_KEY, null);
        JSObject result = new JSObject();
        result.put("token", token != null ? token : JSObject.NULL);
        call.resolve(result);
    }

    @PluginMethod
    public void getNotificationPermissionState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", readNotificationPermissionState());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("state", "granted");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (call == null) {
            return;
        }

        JSObject result = new JSObject();
        result.put("state", readNotificationPermissionState());
        call.resolve(result);
    }

    @PluginMethod
    public void getPendingLaunchTarget(PluginCall call) {
        JSObject result = new JSObject();
        result.put("target", readPendingLaunchTarget());
        call.resolve(result);
    }

    @PluginMethod
    public void showLocalNotification(PluginCall call) {
        String title = normalize(call.getString("title"));
        String body = normalize(call.getString("body"));
        if (title == null || body == null) {
            call.reject("title and body are required");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("notification permission is not granted");
            return;
        }

        createNotificationChannelIfNeeded();

        String route = normalize(call.getString("route"));
        String conversationId = normalize(call.getString("conversationId"));
        String groupId = normalize(call.getString("groupId"));
        String source = normalize(call.getString("source"));
        String notificationId = normalize(call.getString("id"));

        Intent launchIntent = new Intent(getContext(), MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        applyLaunchTargetExtras(launchIntent, route, conversationId, groupId, source);

        int requestCode = notificationId != null ? notificationId.hashCode() : (int) System.currentTimeMillis();
        PendingIntent contentIntent = PendingIntent.getActivity(
            getContext(),
            requestCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        NotificationManagerCompat.from(getContext()).notify(requestCode, builder.build());
        call.resolve();
    }

    @PluginMethod
    public void clearPendingLaunchTarget(PluginCall call) {
        clearPendingLaunchTarget();
        call.resolve();
    }

    private JSObject buildAsset(Uri uri) {
        JSObject asset = new JSObject();
        asset.put("path", uri.toString());
        asset.put("webPath", uri.toString());

        String mimeType = getContext().getContentResolver().getType(uri);
        if (mimeType != null && !mimeType.trim().isEmpty()) {
            asset.put("mimeType", mimeType);
        }

        String fileName = readDisplayName(uri);
        if (fileName != null) {
            asset.put("fileName", fileName);
        }

        return asset;
    }

    private String readDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(uri, null, null, null, null);
            if (cursor == null || !cursor.moveToFirst()) {
                return null;
            }

            int nameColumnIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
            if (nameColumnIndex < 0) {
                return null;
            }

            return cursor.getString(nameColumnIndex);
        } catch (Exception exception) {
            return null;
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    private SharedPreferences getPreferences() {
        return getContext().getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }

    private JSObject readPendingLaunchTarget() {
        SharedPreferences preferences = getPreferences();
        String kind = normalize(preferences.getString(LAUNCH_TARGET_KIND_KEY, null));
        if (kind == null) {
            return null;
        }

        JSObject target = new JSObject();
        target.put("kind", kind);

        String route = normalize(preferences.getString(LAUNCH_TARGET_ROUTE_KEY, null));
        if (route != null) {
            target.put("route", route);
        }

        String conversationId = normalize(preferences.getString(LAUNCH_TARGET_CONVERSATION_ID_KEY, null));
        if (conversationId != null) {
            target.put("conversationId", conversationId);
        }

        String groupId = normalize(preferences.getString(LAUNCH_TARGET_GROUP_ID_KEY, null));
        if (groupId != null) {
            target.put("groupId", groupId);
        }

        String source = normalize(preferences.getString(LAUNCH_TARGET_SOURCE_KEY, null));
        if (source != null) {
            target.put("source", source);
        }

        return target;
    }

    private void clearPendingLaunchTarget() {
        getPreferences()
            .edit()
            .remove(LAUNCH_TARGET_KIND_KEY)
            .remove(LAUNCH_TARGET_ROUTE_KEY)
            .remove(LAUNCH_TARGET_CONVERSATION_ID_KEY)
            .remove(LAUNCH_TARGET_GROUP_ID_KEY)
            .remove(LAUNCH_TARGET_SOURCE_KEY)
            .apply();
    }

    private String readNotificationPermissionState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return "granted";
        }

        PermissionState permissionState = getPermissionState("notifications");
        return permissionState != null ? permissionState.toString() : "unknown";
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private void applyLaunchTargetExtras(
        Intent intent,
        String route,
        String conversationId,
        String groupId,
        String source
    ) {
        if (intent == null) {
            return;
        }

        String kind;
        if (conversationId != null) {
            kind = "conversation";
        } else if (groupId != null) {
            kind = "group";
        } else {
            kind = "route";
        }

        intent.putExtra(EXTRA_TARGET_KIND, kind);
        intent.putExtra(EXTRA_TARGET_SOURCE, source != null ? source : "local_reminder");

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

    private void createNotificationChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("隐界的新消息与提醒");
        manager.createNotificationChannel(channel);
    }

    static void cacheLaunchTarget(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        String kind = normalizeStatic(intent.getStringExtra(EXTRA_TARGET_KIND));
        String route = normalizeStatic(intent.getStringExtra(EXTRA_TARGET_ROUTE));
        String conversationId = normalizeStatic(intent.getStringExtra(EXTRA_CONVERSATION_ID));
        String groupId = normalizeStatic(intent.getStringExtra(EXTRA_GROUP_ID));
        String source = normalizeStatic(intent.getStringExtra(EXTRA_TARGET_SOURCE));

        if (kind == null) {
            if (conversationId != null) {
                kind = "conversation";
            } else if (groupId != null) {
                kind = "group";
            } else if (route != null) {
                kind = "route";
            }
        }

        if (kind == null) {
            return;
        }

        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES_NAME, Activity.MODE_PRIVATE);
        SharedPreferences.Editor editor = preferences.edit().putString(LAUNCH_TARGET_KIND_KEY, kind);

        if (route != null) {
            editor.putString(LAUNCH_TARGET_ROUTE_KEY, route);
        } else {
            editor.remove(LAUNCH_TARGET_ROUTE_KEY);
        }

        if (conversationId != null) {
            editor.putString(LAUNCH_TARGET_CONVERSATION_ID_KEY, conversationId);
        } else {
            editor.remove(LAUNCH_TARGET_CONVERSATION_ID_KEY);
        }

        if (groupId != null) {
            editor.putString(LAUNCH_TARGET_GROUP_ID_KEY, groupId);
        } else {
            editor.remove(LAUNCH_TARGET_GROUP_ID_KEY);
        }

        editor.putString(LAUNCH_TARGET_SOURCE_KEY, source != null ? source : "notification").apply();
    }

    private static String normalizeStatic(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
