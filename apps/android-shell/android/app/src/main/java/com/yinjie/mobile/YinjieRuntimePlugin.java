package com.yinjie.mobile;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;

import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.pm.PackageInfoCompat;
import androidx.core.os.LocaleListCompat;

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
import java.util.Locale;

@CapacitorPlugin(name = "YinjieRuntime")
public class YinjieRuntimePlugin extends Plugin {
    private static final String DEFAULT_LOCALE = "zh-CN";
    private static final String LOCALE_SOURCE_APP = "app";
    private static final String LOCALE_SOURCE_SYSTEM = "system";
    private static final String LOCALE_SOURCE_DEFAULT = "default";

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

    @PluginMethod
    public void getLocale(PluginCall call) {
        call.resolve(readLocalePayload());
    }

    @PluginMethod
    public void setLocale(PluginCall call) {
        String locale = resolveSupportedLocale(call.getString("locale"));
        if (locale == null) {
            call.reject("unsupported locale");
            return;
        }

        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(locale));

        JSObject result = new JSObject();
        result.put("locale", locale);
        result.put("source", LOCALE_SOURCE_APP);
        call.resolve(result);
    }

    private JSObject readLocalePayload() {
        LocaleListCompat applicationLocales = AppCompatDelegate.getApplicationLocales();
        if (!applicationLocales.isEmpty()) {
            String locale = resolveSupportedLocale(applicationLocales.get(0));
            if (locale != null) {
                return buildLocalePayload(locale, LOCALE_SOURCE_APP);
            }
        }

        String systemLocale = resolveSupportedLocale(readSystemLocale());
        if (systemLocale != null) {
            return buildLocalePayload(systemLocale, LOCALE_SOURCE_SYSTEM);
        }

        return buildLocalePayload(DEFAULT_LOCALE, LOCALE_SOURCE_DEFAULT);
    }

    private JSObject buildLocalePayload(String locale, String source) {
        JSObject result = new JSObject();
        result.put("locale", locale);
        result.put("source", source);
        return result;
    }

    private Locale readSystemLocale() {
        Configuration configuration = getContext().getResources().getConfiguration();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !configuration.getLocales().isEmpty()) {
            return configuration.getLocales().get(0);
        }

        return configuration.locale;
    }

    private String resolveSupportedLocale(Locale locale) {
        if (locale == null) {
            return null;
        }

        return resolveSupportedLocale(locale.toLanguageTag());
    }

    private String resolveSupportedLocale(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim().replace('_', '-').toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return null;
        }

        if (
            normalized.equals("zh") ||
            normalized.equals("zh-cn") ||
            normalized.equals("zh-hans") ||
            normalized.startsWith("zh-hans-")
        ) {
            return "zh-CN";
        }

        if (normalized.equals("en") || normalized.startsWith("en-")) {
            return "en-US";
        }

        if (normalized.equals("ja") || normalized.startsWith("ja-")) {
            return "ja-JP";
        }

        if (normalized.equals("ko") || normalized.startsWith("ko-")) {
            return "ko-KR";
        }

        return null;
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
