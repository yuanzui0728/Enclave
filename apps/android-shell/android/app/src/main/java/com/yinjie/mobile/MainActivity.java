package com.yinjie.mobile;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.ActionMode;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YinjieRuntimePlugin.class);
        registerPlugin(YinjieSecureStoragePlugin.class);
        registerPlugin(YinjieMobileBridgePlugin.class);
        super.onCreate(savedInstanceState);
        YinjieMobileBridgePlugin.cacheLaunchTarget(this, getIntent());

        // 长按聊天气泡时 Android WebView 会启动 system text-selection ActionMode
        // (Copy/Share/Select all/Read aloud floating bar)，跟前端自己的
        // MessageActionSheet 重叠。这里整体禁掉 WebView 的 ActionMode；
        // 前端 sheet 里已经提供 Copy/Forward/Quote 等动作，没有功能损失。
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null) {
            // Capacitor 把 webview origin 设为 https://localhost，但 debug 包配的
            // apiBaseUrl 是 http://10.0.2.2:3000（本机 dev API 没 TLS）。
            // Chrome WebView 默认会 block mixed-content，所有 HTTP fetch 静默失败。
            // debug 包放开 mixed content 模式；release 包始终保持默认 (STRICT)。
            boolean isDebuggable =
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (isDebuggable) {
                webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                WebView.setWebContentsDebuggingEnabled(true);
            }
        }
        if (webView != null) {
            ActionMode.Callback blockSelection =
                new ActionMode.Callback() {
                    @Override
                    public boolean onCreateActionMode(ActionMode mode, android.view.Menu menu) {
                        return false;
                    }

                    @Override
                    public boolean onPrepareActionMode(ActionMode mode, android.view.Menu menu) {
                        return false;
                    }

                    @Override
                    public boolean onActionItemClicked(ActionMode mode, android.view.MenuItem item) {
                        return false;
                    }

                    @Override
                    public void onDestroyActionMode(ActionMode mode) {}
                };
            webView.setOnLongClickListener(v -> true);
            webView.setLongClickable(false);
            try {
                webView.startActionMode(blockSelection, ActionMode.TYPE_FLOATING);
            } catch (Exception ignored) {
                // 部分设备 startActionMode 抛 IllegalStateException，忽略即可，
                // setOnLongClickListener 已经盖住主要路径。
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        YinjieMobileBridgePlugin.cacheLaunchTarget(this, intent);
    }
}
