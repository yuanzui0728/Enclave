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

import org.json.JSONException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

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

            JSObject bundledRuntimeConfig = readBundledRuntimeConfig();
            putIfPresent(
                result,
                "apiBaseUrl",
                readRuntimeValue(
                    bundledRuntimeConfig,
                    "apiBaseUrl",
                    metaData,
                    "yinjie.api_base_url"
                )
            );
            putIfPresent(
                result,
                "socketBaseUrl",
                readRuntimeValue(
                    bundledRuntimeConfig,
                    "socketBaseUrl",
                    metaData,
                    "yinjie.socket_base_url"
                )
            );
            putIfPresent(
                result,
                "environment",
                readRuntimeValue(
                    bundledRuntimeConfig,
                    "environment",
                    metaData,
                    "yinjie.environment"
                )
            );
            if (result.has("apiBaseUrl")) {
                result.put("worldAccessMode", "local");
                result.put("configStatus", "configured");
            }

            call.resolve(result);
        } catch (PackageManager.NameNotFoundException exception) {
            call.reject("failed to read android runtime metadata", exception);
        }
    }

    private JSObject readBundledRuntimeConfig() {
        try (
            InputStream inputStream = getContext().getAssets().open("public/runtime-config.json");
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(inputStream, StandardCharsets.UTF_8)
            )
        ) {
            StringBuilder content = new StringBuilder();
            String line;

            while ((line = reader.readLine()) != null) {
                content.append(line);
            }

            return new JSObject(content.toString());
        } catch (IOException | JSONException exception) {
            return null;
        }
    }

    private String readRuntimeValue(
        JSObject bundledRuntimeConfig,
        String bundledKey,
        Bundle metaData,
        String metaKey
    ) {
        if (bundledRuntimeConfig != null) {
            String bundledValue = bundledRuntimeConfig.getString(bundledKey);
            if (bundledValue != null) {
                bundledValue = bundledValue.trim();
                if (!bundledValue.isEmpty()) {
                    return bundledValue;
                }
            }
        }

        return readMetaValue(metaData, metaKey);
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
