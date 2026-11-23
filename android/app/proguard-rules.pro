# R8 rules for the release build (minifyEnabled true in build.gradle).
#
# Most of the app needs no rules here:
# - Capacitor plugins (including RafeeqAutoPlugin / RafeeqPrayerPlugin) are
#   kept by capacitor-android's consumer rules (@CapacitorPlugin, @PluginMethod).
# - Activities, services, receivers and widget providers are kept because the
#   manifest names them.
# - The bridge's @JavascriptInterface methods are kept by the default
#   proguard-android-optimize.txt.
# - Media3, RevenueCat and @capgo/capacitor-social-login ship their own rules.

# Keep line numbers so crash reports point at real lines, and hide the
# original source file names. Play maps the obfuscated names back using the
# mapping.txt that is packaged into the AAB.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
