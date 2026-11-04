package com.sarathscn.twmg

import android.Manifest
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
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
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.sarathscn.twmg.StartupRules.Event
import com.sarathscn.twmg.StartupRules.Stage
import com.sarathscn.twmg.StartupRules.covering
import com.sarathscn.twmg.StartupRules.failed
import java.io.File

/**
 * TWMG for Android: hosts the TWMG web app (Supabase sign-in, data and all screens) in a
 * locked-down WebView. Native code adds what a browser tab can't: the system back gesture
 * walks the app's own history, edge-to-edge insets, verified links for email confirmation
 * and password reset, the photo picker, file downloads, an animated startup screen with retry, a
 * biometric App lock, local bill reminders and passkeys (WebAuthn) where the device supports them.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var lockView: View
    private var startupView: StartupView? = null
    private var startup = StartupRules.State()
    private var dismissing = false
    private var webDead = false
    private var resumed = false
    private var targetUrl = BuildConfig.APP_URL
    private var clearHistoryOnReady = false
    private val main = Handler(Looper.getMainLooper())
    private val watchdog = Runnable { dispatch(Event.TimedOut(isOnline())) }
    // Back online while the offline screen is up: try again without being asked.
    private val networkWatch = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { main.post { if (startup.stage == Stage.NO_INTERNET) retryStartup() } }
    }
    private val webAlive get() = ::web.isInitialized && !webDead
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
        // Hands the system launch screen over to the first frame of StartupView, which matches it.
        installSplashScreen().setOnExitAnimationListener { splash ->
            // Removing the splash puts the theme's system bar settings back, which undoes edge to edge:
            // white status icons on a light page, a black band at the top and extra padding. Set them again.
            val done = { splash.remove(); applySystemBars() }
            if (ValueAnimator.areAnimatorsEnabled()) splash.view.animate().alpha(0f).setDuration(160).withEndAction { done() }.start() else done()
        }
        applySystemBars()
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
        // Offline changes: show upload progress in the page, and finish anything left from last time.
        SyncBus.listener = { status -> notifyWebJson("sync", status.toString()) }
        if (SyncQueue.activeUser(this) != null) SyncQueue.schedule(this)
        if (Reminders.enabled(this)) Reminders.schedule(this)
        // A force-stop cancels the widgets' tap actions, and an unchanged summary would not restore them.
        Widgets.refreshAll(this)
        // The startup screen runs edge to edge; the app below it stays inside the system bars.
        val outer = FrameLayout(this)
        val root = FrameLayout(this)
        outer.addView(root, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val cover = StartupView(this, startupIsDark()) { retryStartup() }
        startupView = cover
        outer.addView(cover, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        cover.show(startup.stage)
        setContentView(outer)
        // Keep content clear of the status bar, navigation bar, display cutout and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(outer) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            root.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            startupView?.setSafeInsets(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        // A phone with no usable system WebView can't run the app: say so instead of crashing.
        val created = try { WebView(this) } catch (e: Exception) { null }
        if (created == null) { dispatch(Event.DeviceFailed); return }
        web = created.apply { setBackgroundColor(Color.TRANSPARENT) }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        lockView = buildLockView()
        root.addView(lockView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        configure(web)
        applySecureFlag()
        // System back (button or predictive gesture) steps back through in-app navigation first.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webAlive && !locked && !startup.covering && web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        dispatch(Event.Begin(hasSessionCookie()))
        targetUrl = startUrl(intent)
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(targetUrl)
        if (isLockOn()) lock()
    }

    /** Edge to edge, with status and navigation icons that suit the theme chosen in the app. */
    private fun applySystemBars() {
        val style = if (startupIsDark()) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
        window.decorView.findViewById<ViewGroup>(android.R.id.content)?.getChildAt(0)?.let { ViewCompat.requestApplyInsets(it) }
    }

    // ---- Startup screen ---------------------------------------------------------------------
    /** Moves the startup rules on, and makes the screen match. Duplicate events change nothing. */
    private fun dispatch(event: Event) {
        val before = startup
        startup = StartupRules.next(before, event)
        if (before.stage != Stage.AUTH_EXPIRED && startup.stage == Stage.AUTH_EXPIRED) Toast.makeText(this, R.string.session_expired, Toast.LENGTH_LONG).show()
        if (startup.covering) {
            if (startupView == null) showStartupAgain()
            dismissing = false
            startupView?.show(startup.stage)
            if (webAlive) web.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        } else if (before.covering) leaveStartup()
        armWatchdog()
    }

    private fun armWatchdog() {
        main.removeCallbacks(watchdog)
        if (resumed) StartupRules.watchdogMs(startup)?.let { main.postDelayed(watchdog, it) }
    }

    /** Fades out only after the page has painted, so the app never appears as a blank flash. */
    private fun leaveStartup() {
        if (dismissing) return
        dismissing = true
        var left = false
        val go = {
            if (!left) {
                left = true
                main.removeCallbacks(watchdog)
                if (dismissing) startupView?.dismiss {
                    startupView = null; dismissing = false
                    // A page failed during the fade: the error screen comes straight back.
                    if (startup.covering) { showStartupAgain(); startupView?.show(startup.stage) }
                    else if (webAlive) { web.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO; if (clearHistoryOnReady) { web.clearHistory(); clearHistoryOnReady = false } }
                }
            }
        }
        if (webAlive) { web.postVisualStateCallback(1, object : WebView.VisualStateCallback() { override fun onComplete(requestId: Long) { go() } }); main.postDelayed(go, 800) } else go()
    }

    /** A page load failed after the app was already showing: bring the screen back with its Retry button. */
    private fun showStartupAgain() {
        val outer = window.decorView.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as? ViewGroup ?: return
        val cover = StartupView(this, startupIsDark()) { retryStartup() }
        startupView = cover
        outer.addView(cover, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        ViewCompat.requestApplyInsets(outer)
    }

    private fun retryStartup() {
        if (!startup.failed) return
        if (!webAlive) { recreate(); return }
        dispatch(Event.Retry)
        clearHistoryOnReady = true
        web.loadUrl(targetUrl)
    }

    private fun isOnline(): Boolean {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return true
        val network = manager.activeNetwork ?: return false
        return manager.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    private fun hasSessionCookie() = try { CookieManager.getInstance().getCookie(BuildConfig.APP_URL)?.split(';')?.any { it.trim().substringBefore('=').contains("-auth-token") } == true } catch (e: Exception) { false }

    /** The theme chosen inside the app when it has reported one, otherwise the phone's. */
    private fun startupIsDark(): Boolean {
        if (prefs.contains(KEY_DARK)) return prefs.getBoolean(KEY_DARK, false)
        return (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val uri = intent.data?.takeIf(::isAppUrl) ?: return
        // A shortcut or widget tapped while the app is showing: open it there, without a reload that would lose the screen.
        val open = uri.getQueryParameter("open")
        if (WidgetRules.isOpenTarget(open) && webAlive && !startup.covering && onAppPage) { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('twmg-native',{detail:{type:'open',target:'$open'}}))", null); return }
        targetUrl = uri.toString()
        if (webAlive) web.loadUrl(targetUrl)
    }

    // Pause WebView work while the app isn't visible (battery), and re-lock after 30 s away.
    override fun onStart() {
        super.onStart()
        resumed = true
        armWatchdog()
        startupView?.startLoops()
        try { getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(networkWatch) } catch (e: Exception) { /* the Retry button still works */ }
        if (!webAlive) return
        web.resumeTimers()
        if (isLockOn() && !locked && backgroundedAt > 0 && SystemClock.elapsedRealtime() - backgroundedAt > LOCK_AFTER_MS) lock()
    }

    override fun onResume() { super.onResume(); if (webAlive) web.onResume() }
    // Keep the sign-in session on disk so the app can reopen with it (and offline).
    override fun onPause() { if (webAlive) { web.onPause(); CookieManager.getInstance().flush() }; super.onPause() }

    override fun onStop() {
        backgroundedAt = SystemClock.elapsedRealtime()
        resumed = false
        // A paused page can't report in: the watchdog only counts time the app is on screen.
        main.removeCallbacks(watchdog)
        startupView?.stopLoops()
        try { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(networkWatch) } catch (e: Exception) { /* wasn't registered */ }
        if (webAlive) web.pauseTimers()
        super.onStop()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (webAlive) web.saveState(outState)
    }

    override fun onDestroy() {
        SyncBus.listener = null
        main.removeCallbacksAndMessages(null)
        if (webAlive) web.destroy()
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
                dispatch(Event.PageStarted(hasSessionCookie()))
            }

            override fun onPageFinished(view: WebView, url: String?) {
                onAppPage = url?.let { isAppUrl(Uri.parse(it)) } == true
                if (onAppPage) view.evaluateJavascript(DOWNLOAD_HOOK, null)
                dispatch(Event.PageFinished(StartupRules.pageReportsReady(url?.let { Uri.parse(it).path })))
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                // An aborted load is a newer navigation taking over, not a failure.
                if (request.isForMainFrame && error.description?.contains("ERR_ABORTED") != true) { view.stopLoading(); dispatch(Event.LoadFailed(isOnline())) }
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                if (request.isForMainFrame && errorResponse.statusCode >= 500) dispatch(Event.ServerError)
            }

            // The page's renderer crashed or was killed for memory. Without this the whole app dies with it.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                webDead = true
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                recreate()
                return true
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
        runOnUiThread { if (webAlive) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('twmg-native',{detail:{type:'$type',enabled:$enabled}}))", null) }
    }

    private fun notifyWebJson(type: String, json: String) {
        runOnUiThread { if (webAlive) web.evaluateJavascript("window.dispatchEvent(new CustomEvent('twmg-native',{detail:{type:'$type',data:$json}}))", null) }
    }

    private fun openExternally(uri: Uri) {
        // Only ordinary links leave the app; a page can't launch other apps through custom schemes.
        if (uri.scheme !in setOf("https", "http", "mailto", "tel")) return
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: ActivityNotFoundException) { Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show() }
    }

    /**
     * Methods the web app may call as `window.TWMGAndroid.*`. Every call is ignored unless the
     * WebView is showing the app's own origin, so other pages can never reach them.
     */
    inner class NativeBridge {
        // Every method is guarded: a native failure must return a safe value, never throw into the page
        // (WebView turns a Java exception into a JS error, which takes the whole screen down).
        private inline fun <T> safe(fallback: T, block: () -> T): T = try { if (onAppPage) block() else fallback } catch (e: Throwable) { fallback }

        // ---- Startup screen ----
        /** The app screen is reading its data. */
        @JavascriptInterface fun startupStage(stage: String) = safe(Unit) { if (stage == "data") runOnUiThread { dispatch(Event.LoadingData) } }
        /** The app screen has something to show: data, the sign-in screen, or its own error with a retry. */
        @JavascriptInterface fun startupReady(outcome: String) = safe(Unit) { runOnUiThread { dispatch(Event.WebReady(signedOut = outcome == "signed-out")) } }
        /** Remembers the theme chosen in the app, so the next startup screen opens in it. */
        @JavascriptInterface fun setAppTheme(dark: Boolean) = safe(Unit) { prefs.edit().putBoolean(KEY_DARK, dark).apply(); runOnUiThread { applySystemBars() } }

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
                        Widgets.refreshAll(this@MainActivity)
                        applySecureFlag()
                        notifyWeb("appLock", enabled)
                    }
                } catch (e: Exception) { notifyWeb("appLock", isLockOn()) }
            }
        }

        // ---- Offline changes (see SyncQueue) ----
        @JavascriptInterface fun queueAdd(op: String): Boolean = safe(false) { SyncQueue.add(this@MainActivity, op).also { if (it) SyncQueue.schedule(this@MainActivity) } }
        @JavascriptInterface fun queueList(user: String): String = safe("[]") { SyncQueue.list(this@MainActivity, user).toString() }
        @JavascriptInterface fun queueDiscard(opId: String) = safe(Unit) { SyncQueue.remove(this@MainActivity, opId); SyncQueue.schedule(this@MainActivity) }
        @JavascriptInterface fun queueRetry(opId: String, keepMine: Boolean) = safe(Unit) { SyncQueue.retry(this@MainActivity, opId, keepMine); SyncQueue.schedule(this@MainActivity) }
        @JavascriptInterface fun syncNow() = safe(Unit) { SyncQueue.schedule(this@MainActivity) }
        @JavascriptInterface fun syncStatus(): String = safe("{}") { SyncQueue.status(this@MainActivity).toString() }
        /** Called after the server confirmed who is signed in; only that account's changes are uploaded. */
        @JavascriptInterface fun setSyncUser(user: String) = safe(Unit) { if (user.isNotBlank()) { SyncQueue.setActiveUser(this@MainActivity, user); SyncQueue.schedule(this@MainActivity) } }
        /** Sign-out: forget this account's queued changes on this device. */
        @JavascriptInterface fun clearLocal(user: String) = safe(Unit) { SyncQueue.clearUser(this@MainActivity, user); Widgets.clear(this@MainActivity) }
        /** A small summary for the home screen widgets: a count per day and the active profile's name. */
        @JavascriptInterface fun updateWidgets(json: String) = safe(Unit) { if (json.length <= 20_000) Widgets.update(this@MainActivity, json) }
        /** Whether the device still holds a sign-in session cookie (it is removed on sign-out). */
        @JavascriptInterface fun hasSession(): Boolean = safe(false) { hasSessionCookie() }
        /** The installed app version, straight from the package (set by android-release.json at build time). */
        @JavascriptInterface fun appVersion(): String = safe("{}") {
            val info = packageManager.getPackageInfo(packageName, 0)
            val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
            org.json.JSONObject().put("versionName", info.versionName ?: "").put("versionCode", code).toString()
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
                // Before Android 10 the file goes to this app's own folder, not the shared Downloads.
                val saved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) R.string.saved_to_downloads else R.string.saved_to_app_files
                Toast.makeText(this@MainActivity, if (result.isSuccess) getString(saved, safeName) else getString(R.string.save_failed), Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun notificationsAllowed() = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private companion object {
        const val KEY_APP_LOCK = "app_lock"
        const val KEY_DARK = "startup_dark"
        const val LOCK_AFTER_MS = 30_000L
        // The web app downloads via `a.download` + blob URLs, which WebView ignores. Remember each
        // blob as it's created, and hand downloads to the native bridge instead.
        const val DOWNLOAD_HOOK = """(function(){if(window.__twmgDownloads||!window.TWMGAndroid)return;window.__twmgDownloads=new Map();
            var create=URL.createObjectURL.bind(URL);URL.createObjectURL=function(o){var u=create(o);if(o instanceof Blob)window.__twmgDownloads.set(u,o);return u};
            var click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){var b=this.download&&window.__twmgDownloads.get(this.href);
            if(!b)return click.call(this);var name=this.download,r=new FileReader();r.onload=function(){TWMGAndroid.saveFile(name,r.result)};r.readAsDataURL(b)}})();"""
    }
}
