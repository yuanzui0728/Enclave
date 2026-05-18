# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor 7 loads plugin classes via Class.forName() from
# assets/capacitor.plugins.json, and discovers @PluginMethod-annotated methods
# on each plugin class via reflection (PluginHandle.loadPluginMethods →
# pluginClass.getMethods() → methodReflect.getAnnotation(PluginMethod.class)).
# Capacitor 7 ships NO consumer-rules.pro, so R8 with minifyEnabled=true +
# shrinkResources=true will:
#   1) rename plugin classes — Class.forName by string fails, plugin missing；
#   2) strip / rename @PluginMethod methods — reflection finds 0 methods,
#      every JS-side call rejects with "method not implemented";
#   3) strip annotations entirely without -keepattributes — getAnnotation
#      returns null even on kept methods.
# All three modes are silent in release; debug builds skip minify so they
# look fine. Symptom in release: every plugin call from JS hangs / rejects.

-keepattributes *Annotation*

# Keep every @CapacitorPlugin-annotated class plus its @PluginMethod /
# @ActivityCallback / @PermissionCallback members so Capacitor's reflective
# dispatch keeps working in release.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * {
    @com.getcapacitor.PluginMethod *;
    @com.getcapacitor.annotation.ActivityCallback *;
    @com.getcapacitor.annotation.PermissionCallback *;
}

# Custom Yinjie plugins (registered by Class literal in MainActivity, so the
# class itself isn't shrunk — but method names must stay intact for
# PluginHandle reflection). Belt-and-suspenders to the @CapacitorPlugin rule
# above in case the annotation rule misses anything (e.g. helper methods
# called from JS via callback IDs).
-keep public class com.yinjie.mobile.YinjieRuntimePlugin { *; }
-keep public class com.yinjie.mobile.YinjieMobileBridgePlugin { *; }
-keep public class com.yinjie.mobile.YinjieSecureStoragePlugin { *; }
-keep public class com.yinjie.mobile.YinjieFirebaseMessagingService { *; }
-keep public class com.yinjie.mobile.YinjieNotificationChannels { *; }
-keep public class com.yinjie.mobile.YinjieApplication { *; }
-keep public class com.yinjie.mobile.MainActivity { *; }

# Capacitor's own plugin packages — Capacitor 7's official @capacitor/* AARs
# also lack consumer-rules, so PluginManager.Class.forName(classpath) for
# AppPlugin / KeyboardPlugin / SplashScreenPlugin / StatusBarPlugin
# (listed in capacitor.plugins.json) would fail post-R8 without these.
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.getcapacitor.plugin.** { *; }
-keep class com.getcapacitor.** { *; }

# WebView JS interface bridge methods (Capacitor Bridge uses
# @JavascriptInterface to expose its native bridge to the JS side; default
# rules already keep these but R8 has historically had bugs here).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Firebase Messaging service relies on ComponentName lookup from Manifest;
# already keeps the service via the @Keep / manifest reference, but its
# subclass methods need to stay intact for FCM SDK reflection.
-keep class com.google.firebase.messaging.** { *; }
