package com.yinjie.mobile;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "YinjieSecureStorage")
public class YinjieSecureStoragePlugin extends Plugin {
    private static final String PREFERENCES_NAME = "com.yinjie.secure_storage";
    private static final String FALLBACK_PREFERENCES_NAME = "com.yinjie.secure_storage_fallback";

    @PluginMethod
    public void get(PluginCall call) {
        String key = normalizeKey(call.getString("key"));
        if (key == null) {
            JSObject result = new JSObject();
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }

        SharedPreferences preferences = getPreferences();
        String value = preferences.getString(key, null);

        JSObject result = new JSObject();
        result.put("value", value != null ? value : JSObject.NULL);
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = normalizeKey(call.getString("key"));
        String value = call.getString("value");
        if (key == null || value == null) {
          call.reject("key and value are required");
          return;
        }

        getPreferences().edit().putString(key, value).apply();
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = normalizeKey(call.getString("key"));
        if (key == null) {
            call.resolve();
            return;
        }

        getPreferences().edit().remove(key).apply();
        call.resolve();
    }

    private SharedPreferences getPreferences() {
        try {
            MasterKey masterKey = new MasterKey.Builder(getContext())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();

            return EncryptedSharedPreferences.create(
                getContext(),
                PREFERENCES_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception exception) {
            return getContext().getSharedPreferences(FALLBACK_PREFERENCES_NAME, Context.MODE_PRIVATE);
        }
    }

    private String normalizeKey(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
