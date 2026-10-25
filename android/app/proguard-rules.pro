# The download bridge is called from JavaScript by name.
-keepclassmembers class com.sarathscn.twmg.MainActivity$DownloadBridge {
    @android.webkit.JavascriptInterface <methods>;
}
