# The native bridge is called from JavaScript by method name.
-keepclassmembers class com.sarathscn.twmg.MainActivity$NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
