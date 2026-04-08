package com.yinjie.mobile;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "YinjieRuntime")
public class YinjieRuntimePlugin extends Plugin {
    @PluginMethod
    public void getConfig(PluginCall call) {
        try {
            PackageManager packageManager = getContext().getPackageManager();
            ApplicationInfo applicationInfo =
                packageManager.getApplicationInfo(getContext().getPackageName(), PackageManager.GET_META_DATA);
            PackageInfo packageInfo = packageManager.getPackageInfo(getContext().getPackageName(), 0);
            Bundle metaData = applicationInfo.metaData;

            JSObject result = new JSObject();
            result.put("appPlatform", "android");
            result.put("publicAppName", packageManager.getApplicationLabel(applicationInfo).toString());
            result.put("applicationId", getContext().getPackageName());
            putIfPresent(result, "appVersionName", packageInfo.versionName);
            result.put("appVersionCode", PackageInfoCompat.getLongVersionCode(packageInfo));

            putIfPresent(result, "apiBaseUrl", readMetaValue(metaData, "yinjie.api_base_url"));
            putIfPresent(result, "socketBaseUrl", readMetaValue(metaData, "yinjie.socket_base_url"));
            putIfPresent(result, "environment", readMetaValue(metaData, "yinjie.environment"));

            call.resolve(result);
        } catch (PackageManager.NameNotFoundException exception) {
            call.reject("failed to read android runtime metadata", exception);
        }
    }

    private String readMetaValue(Bundle metaData, String key) {
        if (metaData == null) {
            return null;
        }

        String value = metaData.getString(key);
        if (value == null) {
            return null;
        }

        value = value.trim();
        return value.isEmpty() ? null : value;
    }

    private void putIfPresent(JSObject target, String key, String value) {
        if (value != null) {
            target.put(key, value);
        }
    }
}
