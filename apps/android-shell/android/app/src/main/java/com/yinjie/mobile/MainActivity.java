package com.yinjie.mobile;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YinjieRuntimePlugin.class);
        registerPlugin(YinjieSecureStoragePlugin.class);
        registerPlugin(YinjieMobileBridgePlugin.class);
        super.onCreate(savedInstanceState);
        YinjieMobileBridgePlugin.cacheLaunchTarget(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        YinjieMobileBridgePlugin.cacheLaunchTarget(this, intent);
    }
}
