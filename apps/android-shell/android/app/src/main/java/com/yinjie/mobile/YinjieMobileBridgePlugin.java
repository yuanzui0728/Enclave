package com.yinjie.mobile;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

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
}
