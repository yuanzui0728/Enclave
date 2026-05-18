package com.yinjie.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.FileUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.IOException;
import java.io.FileOutputStream;

@CapacitorPlugin(
    name = "YinjieMobileBridge",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
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
    private static final String CHANNEL_ID = YinjieNotificationChannels.MESSAGES_CHANNEL_ID;
    private Uri pendingCameraCaptureUri;
    // Round 34：cancel 分支里要删的是 cacheDir 里那个实际文件，captureUri 是
    // FileProvider 包出来的 content:// URI（getPath() 不是真实路径），按 scheme
    // 判 "file" 永远进不到清理；把真实 File 引用拽出来，cancel 时直接 delete。
    private File pendingCameraCaptureFile;

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = normalize(call.getString("url"));
        if (url == null) {
            call.reject("url is required");
            return;
        }

        // 不要无脑 addCategory(BROWSABLE)：浏览器的 filter 同时声明 DEFAULT + BROWSABLE
        // 是「我能接 web 跳转」，但 dialer / mail / sms 的 filter 只声明 DEFAULT，
        // 一旦 intent 里带上 BROWSABLE，tel:/mailto:/sms: 都会 ActivityNotFoundException，
        // 公众号文章里的电话 / 邮箱 / 短信链接全部静默打不开。
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
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

        // navigator.share / native bridge 的 title 是「主题 / subject」语义，不是
        // 正文。Round 13 当时把 title 顺手拼到 EXTRA_TEXT 头部本意是给聊天 app
        // 兜底，可所有主要 caller 都已经把 title 又拼进了 text 里 ——
        //   official-article-viewer: text=`${accountName}\n${article.title}`
        //   official-account-article-page: text=`${article.account.name}\n${article.title}`
        //   mobile-document-shell:    text=[title, summary, documentUrl].join('\n\n')
        //   mini-programs-page:       text=`${miniProgram.name}\n${link}` + title=`${name} 入口`
        //   games-page:               text=`${game.name}\n${link}` + title=`${name} 入口`
        // 结果分享到微信 / WhatsApp / Line / Telegram 时正文里标题完整出现两遍，
        // 分享到 Mail 还会再叠一遍 EXTRA_SUBJECT，总共出现三次（subject + 拼接
        // 进来的 title + 拼接进来的 text 里那一份）。iOS 壳 Round 38 已经把同款
        // 路径修过：title 只走 setValue(forKey:"subject") 落到邮件主题，activityItems
        // 只放 text + url；caller 负责把要给聊天 app 看的内容自己拼进 text。
        // Android 这边保持同一契约，title 不再 prepend 到 EXTRA_TEXT。
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
            // 邮件 app 走 EXTRA_SUBJECT 把 title 落到「邮件主题」一栏；聊天 app
            // 忽略这条 extra，只看 EXTRA_TEXT，所以 title 不会出现两遍。
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
        }

        Intent chooser = Intent.createChooser(
            shareIntent,
            title != null ? title : getContext().getString(R.string.native_share_title)
        );
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception exception) {
            call.reject("failed to open share sheet", exception);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String base64Data = normalize(call.getString("base64Data"));
        String fileName = normalize(call.getString("fileName"));
        String mimeType = normalize(call.getString("mimeType"));
        String title = normalize(call.getString("title"));

        if (base64Data == null || fileName == null) {
            call.reject("base64Data and fileName are required");
            return;
        }

        File sharedFile;
        try {
            sharedFile = writeSharedFile(base64Data, fileName);
        } catch (IOException | IllegalArgumentException exception) {
            call.reject("failed to prepare shared file", exception);
            return;
        }

        Uri fileUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            sharedFile
        );

        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType(resolveMimeType(fileName, mimeType));
        shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        shareIntent.setClipData(ClipData.newRawUri(fileName, fileUri));
        if (title != null) {
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
        }

        Intent chooser = Intent.createChooser(
            shareIntent,
            title != null ? title : getContext().getString(R.string.native_share_title)
        );
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception exception) {
            call.reject("failed to open file share sheet", exception);
        }
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String base64Data = normalize(call.getString("base64Data"));
        String fileName = normalize(call.getString("fileName"));
        String mimeType = normalize(call.getString("mimeType"));
        String title = normalize(call.getString("title"));

        if (base64Data == null || fileName == null) {
            call.reject("base64Data and fileName are required");
            return;
        }

        File sharedFile;
        try {
            sharedFile = writeSharedFile(base64Data, fileName);
        } catch (IOException | IllegalArgumentException exception) {
            call.reject("failed to prepare preview file", exception);
            return;
        }

        Uri fileUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            sharedFile
        );

        Intent viewIntent = new Intent(Intent.ACTION_VIEW);
        viewIntent.setDataAndType(fileUri, resolveMimeType(fileName, mimeType));
        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        viewIntent.setClipData(ClipData.newRawUri(fileName, fileUri));

        Intent chooser = Intent.createChooser(
            viewIntent,
            title != null ? title : getContext().getString(R.string.native_open_file_title)
        );
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception exception) {
            call.reject("failed to open file preview", exception);
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

    @PluginMethod
    public void pickFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");

        startActivityForResult(call, intent, "pickFileResult");
    }

    @PluginMethod
    public void captureImage(PluginCall call) {
        PermissionState cameraState = getPermissionState("camera");
        if (cameraState == PermissionState.DENIED) {
            // 用户之前点过「拒绝」（Android 11+ 多次拒绝后系统标 PROMPT_NEVER_AGAIN
            // → DENIED）；再 requestPermissionForAlias 不会弹任何系统 dialog，回调里
            // 同样拿到 DENIED，跟 captureImageResult 里「用户点取消」完全没法区分。
            // iOS 壳 Round 25 已经统一用 PERMISSION_DENIED code，这里照搬。
            call.reject(
                "camera permission denied — open Settings to grant access",
                "PERMISSION_DENIED"
            );
            return;
        }

        if (cameraState != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionResult");
            return;
        }

        startCaptureImage(call);
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
        int dataFlags = data.getFlags();
        if (data.getClipData() != null) {
            for (int index = 0; index < data.getClipData().getItemCount(); index += 1) {
                Uri uri = data.getClipData().getItemAt(index).getUri();
                // pickFileResult 早就调 persistReadPermission，pickImagesResult
                // 这条路径漏了。ACTION_OPEN_DOCUMENT 给的 content:// URI 默认
                // 只在调用方 process 存活期间可读；用户选完图后切到后台 / 系统
                // 因为内存压力回收 activity，回前台时 webview 加载 webPath 预览
                // 或上传组件 fetch() 这条 URI 都会拿到 SecurityException，
                // 选好的图静默变灰 / 上传失败。
                persistReadPermission(uri, dataFlags);
                assets.put(buildAsset(uri));
            }
        } else if (data.getData() != null) {
            Uri uri = data.getData();
            persistReadPermission(uri, dataFlags);
            assets.put(buildAsset(uri));
        }

        call.resolve(response);
    }

    @ActivityCallback
    private void pickFileResult(PluginCall call, ActivityResult result) {
        JSObject response = new JSObject();
        response.put("asset", JSObject.NULL);

        if (call == null) {
            return;
        }

        if (
            result == null ||
            result.getResultCode() != Activity.RESULT_OK ||
            result.getData() == null
        ) {
            call.resolve(response);
            return;
        }

        Intent data = result.getData();
        Uri uri = data.getData();
        if (uri == null) {
            call.resolve(response);
            return;
        }

        persistReadPermission(uri, data.getFlags());
        response.put("asset", buildAsset(uri));
        call.resolve(response);
    }

    @PermissionCallback
    private void cameraPermissionResult(PluginCall call) {
        if (call == null) {
            return;
        }

        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject(
                "camera permission denied — open Settings to grant access",
                "PERMISSION_DENIED"
            );
            return;
        }

        startCaptureImage(call);
    }

    @ActivityCallback
    private void captureImageResult(PluginCall call, ActivityResult result) {
        JSObject response = new JSObject();
        response.put("asset", JSObject.NULL);

        Uri capturedUri = pendingCameraCaptureUri;
        File capturedFile = pendingCameraCaptureFile;
        pendingCameraCaptureUri = null;
        pendingCameraCaptureFile = null;

        if (call == null) {
            return;
        }

        if (
            result == null ||
            result.getResultCode() != Activity.RESULT_OK ||
            capturedUri == null
        ) {
            // Round 34：旧实现按 capturedUri.getScheme()=="file" 删，但
            // FileProvider URI 永远是 content://，这条 cleanup 进不到，每次
            // 用户取消相机就会在 cacheDir 里留一个 yinjie-camera-xxxx.jpg
            // 0-byte / 空白文件。这里直接拿 pendingCameraCaptureFile 删。
            if (capturedFile != null && capturedFile.exists()) {
                capturedFile.delete();
            }
            call.resolve(response);
            return;
        }

        response.put("asset", buildAsset(capturedUri));
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
        // pre-Tiramisu 没 runtime permission，但用户可能已经在系统设置里关掉了
        // 应用通知；之前直接 return "granted"，JS 拿到 granted 去 notify 系统照样
        // 静默丢消息。复用 readNotificationPermissionState 拿真实状态（areNotificationsEnabled
        // + permission 两层）。Tiramisu+ 在 permission=GRANTED 时也走这条直接返回真实状态，
        // 不再二次弹系统授权 dialog。
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("state", readNotificationPermissionState());
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

        // 跟 getNotificationPermissionState (Round 12) 对齐：
        //   - pre-Tiramisu 没 runtime permission，但 areNotificationsEnabled()
        //     在用户关掉通知时返 false；当前实现只判 T+ permission 等于跳过这层
        //     检查直接 notify()，系统静默丢消息，JS 收到 resolve() 以为弹了。
        //   - T+ 也可能 permission=GRANTED + areNotificationsEnabled=false（用户
        //     在 Settings 关掉了整个 channel / app 通知），同样静默掉消息。
        if (!"granted".equals(readNotificationPermissionState())) {
            call.reject("notification permission is not granted");
            return;
        }

        YinjieNotificationChannels.createMessagesChannelIfNeeded(getContext());

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
            // 跟 YinjieFirebaseMessagingService Round 24 对齐：launcher PNG 当
            // smallIcon 在 Android 5+ 会被 mask 成白方块，必须给 alpha-only 矢量。
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(ContextCompat.getColor(getContext(), R.color.notification_accent))
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
        String filePath = FileUtils.getFileUrlForUri(getContext(), uri);
        String webPath =
            bridge != null && bridge.getLocalUrl() != null
                ? FileUtils.getPortablePath(getContext(), bridge.getLocalUrl(), uri)
                : null;

        asset.put("path", filePath != null ? filePath : uri.toString());
        asset.put("webPath", webPath != null ? webPath : uri.toString());

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

    private void startCaptureImage(PluginCall call) {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("camera app is unavailable");
            return;
        }

        File captureFile;
        Uri captureUri;
        try {
            captureFile = createTemporaryImageFile();
            captureUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                captureFile
            );
        } catch (IOException exception) {
            call.reject("failed to prepare camera capture", exception);
            return;
        }

        pendingCameraCaptureUri = captureUri;
        pendingCameraCaptureFile = captureFile;
        intent.putExtra(MediaStore.EXTRA_OUTPUT, captureUri);
        // Round 33：FLAG_GRANT_READ/WRITE_URI_PERMISSION 按 Android 文档只对
        // intent.getData() 那条 URI 生效，**不会**自动传递给 extras 里的
        // EXTRA_OUTPUT URI。Pixel / AOSP 上的 AOSP Camera 因为 FileProvider
        // 设了 grantUriPermissions=true 还能宽松放行，但 Xiaomi MIUI /
        // Huawei EMUI / OnePlus OxygenOS / 红米 / Vivo OriginOS 这几家的
        // 自带相机在 ContentResolver.openOutputStream(EXTRA_OUTPUT URI) 时
        // 拿 SecurityException（"Permission Denial: writing FileProvider"），
        // 相机界面看着拍完了，回 captureImageResult RESULT_OK，但 captureUri
        // 文件是 0 byte 空文件 / 根本没创建。buildAsset 跟着把空 webPath
        // 喂给前端，朋友圈 / 头像上传一张白图、聊天图框转圈最后空缩略图。
        // 修法：把 captureUri 也塞进 ClipData，grant flag 走 ClipData 这条
        // path 就能落到 EXTRA_OUTPUT URI 上（Android 5+ 起的标准做法）。
        intent.setClipData(
            ClipData.newUri(getContext().getContentResolver(), "yinjie-camera", captureUri)
        );
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        startActivityForResult(call, intent, "captureImageResult");
    }

    private File createTemporaryImageFile() throws IOException {
        return File.createTempFile(
            "yinjie-camera-",
            ".jpg",
            getContext().getCacheDir()
        );
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

    private void persistReadPermission(Uri uri, int flags) {
        if (uri == null || uri.getScheme() == null || !"content".equalsIgnoreCase(uri.getScheme())) {
            return;
        }

        int takeFlags = flags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (takeFlags == 0) {
            takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
        }

        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (SecurityException exception) {
            // Some providers do not grant persistable permissions; the picker result can still be used immediately.
        }
    }

    private File writeSharedFile(String base64Data, String fileName) throws IOException {
        byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
        File directory = new File(getContext().getCacheDir(), "yinjie-shared");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("failed to create shared file directory");
        }

        File sharedFile = new File(directory, sanitizeFileName(fileName));
        if (sharedFile.exists() && !sharedFile.delete()) {
            throw new IOException("failed to replace shared file");
        }

        try (FileOutputStream outputStream = new FileOutputStream(sharedFile)) {
            outputStream.write(bytes);
            outputStream.flush();
        }

        return sharedFile;
    }

    private String resolveMimeType(String fileName, String mimeType) {
        if (mimeType != null) {
            return mimeType;
        }

        String extension = MimeTypeMap.getFileExtensionFromUrl(fileName);
        if (extension != null) {
            String resolvedMimeType =
                MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase());
            if (resolvedMimeType != null) {
                return resolvedMimeType;
            }
        }

        return "application/octet-stream";
    }

    private String sanitizeFileName(String fileName) {
        String sanitized = fileName.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return sanitized.isEmpty() ? "shared-file" : sanitized;
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
        // areNotificationsEnabled 反映用户在系统设置 → 应用 → 通知里的「总开关」，
        // 一旦用户主动关掉，就算 Android 13+ runtime permission 还停留在 GRANTED，
        // showLocalNotification 也是静默丢掉不弹任何东西。pre-Tiramisu 没 runtime
        // permission，全靠这条开关来定 granted/denied。
        NotificationManagerCompat manager =
            NotificationManagerCompat.from(getContext());
        boolean notificationsEnabled = manager.areNotificationsEnabled();

        // Round 30：Android 8+ 的通知系统是 channel 粒度的，用户可以在
        // 系统设置 → 应用 → 通知 → 「隐界消息」单独关掉这条 channel
        // （IMPORTANCE_NONE），整条 app 通知总开关却仍开着。这种状态下
        // areNotificationsEnabled() 返 true、runtime permission 也是 GRANTED，
        // 但所有走 yinjie_messages channel 的 notify() —— 包括 FCM 推送和
        // showLocalNotification 本地提醒 —— 都被系统层静默丢弃，JS 收到
        // resolve() 还以为弹了，「打开通知」引导也压根不弹（state="granted"）。
        // 把 channel-level 的 disable 状态合并进 effective enabled。
        if (notificationsEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel =
                manager.getNotificationChannel(CHANNEL_ID);
            if (channel != null
                && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                notificationsEnabled = false;
            }
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return notificationsEnabled ? "granted" : "denied";
        }

        PermissionState permissionState = getPermissionState("notifications");
        if (permissionState == PermissionState.GRANTED && !notificationsEnabled) {
            return "denied";
        }
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

    static void cacheLaunchTarget(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        // FCM 在 app 处于 background 时，对带 notification 字段的 message 走
        // 系统通知栏，根本不进 onMessageReceived；用户点击后系统直接拉起
        // launcher activity，把 data payload 当 intent extras 透传。这条路径上
        // 我们 applyLaunchTargetExtras 写的 yinjie_* 前缀 key 全没有，只有
        // 后端原样发的 conversationId / groupId / route / kind。两套 key 都
        // 试一下，否则 background 收推送点开会回首页而不是目标会话。
        String kind = firstNonNull(
            normalizeStatic(intent.getStringExtra(EXTRA_TARGET_KIND)),
            normalizeStatic(intent.getStringExtra("kind"))
        );
        String route = firstNonNull(
            normalizeStatic(intent.getStringExtra(EXTRA_TARGET_ROUTE)),
            normalizeStatic(intent.getStringExtra("route"))
        );
        String conversationId = firstNonNull(
            normalizeStatic(intent.getStringExtra(EXTRA_CONVERSATION_ID)),
            normalizeStatic(intent.getStringExtra("conversationId"))
        );
        String groupId = firstNonNull(
            normalizeStatic(intent.getStringExtra(EXTRA_GROUP_ID)),
            normalizeStatic(intent.getStringExtra("groupId"))
        );
        String source = firstNonNull(
            normalizeStatic(intent.getStringExtra(EXTRA_TARGET_SOURCE)),
            normalizeStatic(intent.getStringExtra("source"))
        );

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

    private static String firstNonNull(String primary, String fallback) {
        return primary != null ? primary : fallback;
    }
}
