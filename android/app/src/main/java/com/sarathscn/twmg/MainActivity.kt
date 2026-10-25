package com.sarathscn.twmg

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import java.io.File

/**
 * TWMG for Android: hosts the TWMG web app (Supabase sign-in, data and all screens) in a
 * locked-down WebView. Native code adds what a browser tab can't: the system back gesture
 * walks the app's own history, edge-to-edge insets, verified links for email confirmation
 * and password reset, the photo picker, file downloads, an offline retry screen, a biometric
 * App lock, local bill reminders and passkeys (WebAuthn) where the device supports them.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var lockView: View
    private val appUri: Uri = Uri.parse(BuildConfig.APP_URL)
    @Volatile private var onAppPage = false
    private var locked = false
    private var backgroundedAt = 0L
    private lateinit var prompt: BiometricPrompt
    private var onAuthenticated: (() -> Unit)? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val prefs by lazy { getSharedPreferences("twmg", MODE_PRIVATE) }
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) } ?: emptyArray())
        fileCallback = null
    }
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        Reminders.setEnabled(this, granted)
        notifyWeb("reminders", granted)
        if (!granted) Toast.makeText(this, R.string.notifications_denied, Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // One prompt for the activity's lifetime, created in onCreate as the biometric library requires.
        prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val action = onAuthenticated
                onAuthenticated = null
                action?.invoke()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                onAuthenticated = null
                // A cancelled toggle leaves the setting as it was; the web switch snaps back.
                notifyWeb("appLock", isLockOn())
            }
        })
        Reminders.createChannel(this)
        if (Reminders.enabled(this)) Reminders.schedule(this)
        val root = FrameLayout(this)
        web = WebView(this).apply { setBackgroundColor(Color.TRANSPARENT) }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        lockView = buildLockView()
        root.addView(lockView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        // Keep content clear of the status bar, navigation bar, display cutout and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        configure(web)
        applySecureFlag()
        // System back (button or predictive gesture) steps back through in-app navigation first.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!locked && web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(startUrl(intent))
        if (isLockOn()) lock()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.takeIf(::isAppUrl)?.let { web.loadUrl(it.toString()) }
    }

    // Pause WebView work while the app isn't visible (battery), and re-lock after 30 s away.
    override fun onStart() {
        super.onStart()
        web.resumeTimers()
        if (isLockOn() && !locked && backgroundedAt > 0 && SystemClock.elapsedRealtime() - backgroundedAt > LOCK_AFTER_MS) lock()
    }

    override fun onResume() { super.onResume(); web.onResume() }
    override fun onPause() { web.onPause(); super.onPause() }

    override fun onStop() {
        backgroundedAt = SystemClock.elapsedRealtime()
        web.pauseTimers()
        super.onStop()
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
        // Passkeys: let the page use WebAuthn with this app's verified credentials (assetlinks.json).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(view.settings, WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP)
        }
        // Supabase sessions live in first-party cookies on the app's own domain.
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(view, false)
        }
        view.addJavascriptInterface(NativeBridge(), "TWMGAndroid")
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

    // ---- App lock --------------------------------------------------------------------------
    private fun authenticators() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    private fun canUseLock() = BiometricManager.from(this).canAuthenticate(authenticators()) == BiometricManager.BIOMETRIC_SUCCESS
    private fun isLockOn() = prefs.getBoolean(KEY_APP_LOCK, false) && canUseLock()

    // While App lock is on, keep balances out of screenshots and the recent-apps preview.
    private fun applySecureFlag() {
        if (prefs.getBoolean(KEY_APP_LOCK, false)) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    private fun lock() {
        locked = true
        lockView.visibility = View.VISIBLE
        web.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        authenticate(getString(R.string.unlock_title)) { unlock() }
    }

    private fun unlock() {
        locked = false
        lockView.visibility = View.GONE
        web.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
    }

    /** Shows the system prompt; the app only learns success or failure, never biometric data. */
    private fun authenticate(title: String, onSuccess: () -> Unit) {
        if (isFinishing || isDestroyed) return
        try {
            onAuthenticated = onSuccess
            prompt.authenticate(BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(getString(R.string.unlock_subtitle))
                .setAllowedAuthenticators(authenticators())
                .build())
        } catch (e: Exception) {
            // Never crash over the prompt: keep the current setting and tell the user.
            onAuthenticated = null
            notifyWeb("appLock", isLockOn())
            Toast.makeText(this, R.string.lock_unavailable, Toast.LENGTH_LONG).show()
        }
    }

    private fun buildLockView(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(getColor(R.color.background))
        visibility = View.GONE
        isClickable = true
        val pad = (24 * resources.displayMetrics.density).toInt()
        setPadding(pad, pad, pad, pad)
        addView(ImageView(context).apply { setImageResource(R.mipmap.ic_launcher); contentDescription = null }, LinearLayout.LayoutParams(pad * 3, pad * 3))
        addView(TextView(context).apply { setText(R.string.locked_title); textSize = 20f; gravity = Gravity.CENTER; setTextColor(getColor(R.color.text)); setPadding(0, pad, 0, pad / 3) })
        addView(TextView(context).apply { setText(R.string.locked_body); textSize = 14f; gravity = Gravity.CENTER; setTextColor(getColor(R.color.muted)); setPadding(0, 0, 0, pad) })
        addView(Button(context).apply { setText(R.string.unlock_button); setOnClickListener { authenticate(getString(R.string.unlock_title)) { unlock() } } })
    }

    private fun notifyWeb(type: String, enabled: Boolean) {
        runOnUiThread { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('twmg-native',{detail:{type:'$type',enabled:$enabled}}))", null) }
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

    /**
     * Methods the web app may call as `window.TWMGAndroid.*`. Every call is ignored unless the
     * WebView is showing the app's own origin, so other pages can never reach them.
     */
    inner class NativeBridge {
        // Every method is guarded: a native failure must return a safe value, never throw into the page
        // (WebView turns a Java exception into a JS error, which takes the whole screen down).
        private inline fun <T> safe(fallback: T, block: () -> T): T = try { if (onAppPage) block() else fallback } catch (e: Throwable) { fallback }

        @JavascriptInterface fun appLockAvailable(): Boolean = safe(false) { canUseLock() }
        @JavascriptInterface fun appLockEnabled(): Boolean = safe(false) { isLockOn() }

        /** Turning App lock on or off requires a successful biometric/device-credential check. */
        @JavascriptInterface fun setAppLockEnabled(enabled: Boolean) = safe(Unit) {
            runOnUiThread {
                try {
                    if (!canUseLock()) { notifyWeb("appLock", false); return@runOnUiThread }
                    notifyWeb("appLock", isLockOn())
                    authenticate(getString(if (enabled) R.string.enable_lock_title else R.string.disable_lock_title)) {
                        prefs.edit().putBoolean(KEY_APP_LOCK, enabled).apply()
                        applySecureFlag()
                        notifyWeb("appLock", enabled)
                    }
                } catch (e: Exception) { notifyWeb("appLock", isLockOn()) }
            }
        }

        @JavascriptInterface fun remindersEnabled(): Boolean = safe(false) { Reminders.enabled(this@MainActivity) && notificationsAllowed() }

        @JavascriptInterface fun setRemindersEnabled(enabled: Boolean) = safe(Unit) {
            runOnUiThread {
                if (enabled && !notificationsAllowed() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                else { Reminders.setEnabled(this@MainActivity, enabled && notificationsAllowed()); notifyWeb("reminders", Reminders.enabled(this@MainActivity)) }
            }
        }

        /** The web app's data changed (a bill paid, a due date moved): refresh reminders from the server. */
        @JavascriptInterface fun syncReminders(lang: String) = safe(Unit) { Reminders.requestSync(this@MainActivity, lang) }

        /** Receives files the web app downloads (CSV export, JSON backup) and saves them to Downloads. */
        @JavascriptInterface fun saveFile(name: String, dataUrl: String) = safe(Unit) {
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

    private fun notificationsAllowed() = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private companion object {
        const val KEY_APP_LOCK = "app_lock"
        const val LOCK_AFTER_MS = 30_000L
        // The web app downloads via `a.download` + blob URLs, which WebView ignores. Remember each
        // blob as it's created, and hand downloads to the native bridge instead.
        const val DOWNLOAD_HOOK = """(function(){if(window.__twmgDownloads||!window.TWMGAndroid)return;window.__twmgDownloads=new Map();
            var create=URL.createObjectURL.bind(URL);URL.createObjectURL=function(o){var u=create(o);if(o instanceof Blob)window.__twmgDownloads.set(u,o);return u};
            var click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){var b=this.download&&window.__twmgDownloads.get(this.href);
            if(!b)return click.call(this);var name=this.download,r=new FileReader();r.onload=function(){TWMGAndroid.saveFile(name,r.result)};r.readAsDataURL(b)}})();"""
    }
}
