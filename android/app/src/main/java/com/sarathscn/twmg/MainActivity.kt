package com.sarathscn.twmg

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File

/**
 * TWMG for Android: hosts the TWMG web app (Supabase sign-in, data and all screens) in a
 * locked-down WebView. Native code adds what a browser tab can't: the system back gesture
 * walks the app's own history, edge-to-edge insets, verified links for email confirmation
 * and password reset, the photo picker, file downloads and an offline retry screen.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val appUri: Uri = Uri.parse(BuildConfig.APP_URL)
    @Volatile private var onAppPage = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) } ?: emptyArray())
        fileCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        web = WebView(this).apply { setBackgroundColor(Color.TRANSPARENT) }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        // Keep content clear of the status bar, navigation bar, display cutout and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        configure(web)
        // System back (button or predictive gesture) steps back through in-app navigation first.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(startUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.takeIf(::isAppUrl)?.let { web.loadUrl(it.toString()) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun startUrl(intent: Intent?): String = intent?.data?.takeIf(::isAppUrl)?.toString() ?: BuildConfig.APP_URL

    private fun isAppUrl(uri: Uri) = uri.scheme == "https" && uri.host == appUri.host

    @SuppressLint("SetJavaScriptEnabled")
    private fun configure(view: WebView) {
        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            // The app has its own text-size setting; don't let system font scaling double it.
            textZoom = 100
            userAgentString = "$userAgentString TWMGAndroid/${BuildConfig.VERSION_NAME}"
        }
        // Supabase sessions live in first-party cookies on the app's own domain.
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(view, false)
        }
        view.addJavascriptInterface(DownloadBridge(), "TWMGAndroid")
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (isAppUrl(uri)) return false
                openExternally(uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                onAppPage = url?.let { isAppUrl(Uri.parse(it)) } == true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                onAppPage = url?.let { isAppUrl(Uri.parse(it)) } == true
                if (onAppPage) view.evaluateJavascript(DOWNLOAD_HOOK, null)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) view.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null)
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val type = params.acceptTypes.firstOrNull { it.isNotBlank() }?.substringBefore(',') ?: "*/*"
                return try { pickFile.launch(type); true } catch (e: ActivityNotFoundException) { fileCallback = null; false }
            }
        }
    }

    private fun openExternally(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: ActivityNotFoundException) { Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show() }
    }

    private fun offlinePage(): String {
        val dark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        val (bg, fg, muted) = if (dark) Triple("#17221d", "#e2e8dc", "#9da895") else Triple("#f6f6f1", "#293b31", "#7b857d")
        return """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
            body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:$bg;color:$fg;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
            h1{font-size:20px;margin:0 0 8px}p{color:$muted;font-size:14px;line-height:1.5;margin:0 0 20px}
            a{display:inline-block;background:#2d6048;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600}
            </style></head><body><div><h1>You're offline</h1><p>TWMG needs a connection to load your money. Check your internet and try again.</p><a href="${BuildConfig.APP_URL}">Try again</a></div></body></html>"""
    }

    /** Receives files the web app downloads (CSV export, JSON backup) and saves them to Downloads. */
    inner class DownloadBridge {
        @JavascriptInterface
        fun saveFile(name: String, dataUrl: String) {
            if (!onAppPage) return
            val safeName = name.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(120).ifBlank { "twmg-download" }
            val mime = dataUrl.substringAfter("data:", "").substringBefore(';').substringBefore(',').ifBlank { "application/octet-stream" }
            val result = runCatching {
                val bytes = Base64.decode(dataUrl.substringAfter(','), Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mime)
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("no uri")
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("no stream")
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: error("no dir")
                    File(dir, safeName).writeBytes(bytes)
                }
            }
            runOnUiThread {
                Toast.makeText(this@MainActivity, if (result.isSuccess) getString(R.string.saved_to_downloads, safeName) else getString(R.string.save_failed), Toast.LENGTH_LONG).show()
            }
        }
    }

    private companion object {
        // The web app downloads via `a.download` + blob URLs, which WebView ignores. Remember each
        // blob as it's created, and hand downloads to the native bridge instead.
        const val DOWNLOAD_HOOK = """(function(){if(window.__twmgDownloads||!window.TWMGAndroid)return;window.__twmgDownloads=new Map();
            var create=URL.createObjectURL.bind(URL);URL.createObjectURL=function(o){var u=create(o);if(o instanceof Blob)window.__twmgDownloads.set(u,o);return u};
            var click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){var b=this.download&&window.__twmgDownloads.get(this.href);
            if(!b)return click.call(this);var name=this.download,r=new FileReader();r.onload=function(){TWMGAndroid.saveFile(name,r.result)};r.readAsDataURL(b)}})();"""
    }
}
