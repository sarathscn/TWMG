package com.sarathscn.twmg

/**
 * What the startup screen shows and when it leaves, as pure rules with no Android types so they can
 * be unit tested. Stages follow the real work (the page loading, then the web app reporting it has
 * something to show); nothing waits on a timer except the watchdog, which guarantees the screen can
 * never stay up forever.
 */
object StartupRules {
    enum class Stage { INITIALIZING, RESTORING_SESSION, CONNECTING, LOADING_DATA, RETRYING, READY, AUTH_EXPIRED, NO_INTERNET, SERVER_UNAVAILABLE, FAILED }

    data class State(val stage: Stage = Stage.INITIALIZING, val pageLoaded: Boolean = false, val hadSession: Boolean = false)

    sealed interface Event {
        /** Local setup finished; [hasSession] is whether a sign-in cookie is on the device. */
        data class Begin(val hasSession: Boolean) : Event
        /** The WebView started loading the main page. */
        data class PageStarted(val hasSession: Boolean) : Event
        /** The main page finished; [reportsReady] is false for pages that never signal (password reset). */
        data class PageFinished(val reportsReady: Boolean) : Event
        /** The web app is reading its data. */
        data object LoadingData : Event
        /** The web app has a screen to show. */
        data class WebReady(val signedOut: Boolean) : Event
        /** The main page couldn't be fetched. */
        data class LoadFailed(val online: Boolean) : Event
        /** The server answered the main page with a 5xx. */
        data object ServerError : Event
        /** The watchdog ran out of time. */
        data class TimedOut(val online: Boolean) : Event
        /** Something on the device stopped startup, such as no system WebView. */
        data object DeviceFailed : Event
        data object Retry : Event
    }

    val State.covering get() = stage != Stage.READY && stage != Stage.AUTH_EXPIRED
    val State.failed get() = stage == Stage.NO_INTERNET || stage == Stage.SERVER_UNAVAILABLE || stage == Stage.FAILED

    private fun unreachable(online: Boolean) = if (online) Stage.SERVER_UNAVAILABLE else Stage.NO_INTERNET

    fun next(state: State, event: Event): State = when (event) {
        is Event.Begin -> if (state.stage == Stage.INITIALIZING) state.copy(stage = if (event.hasSession) Stage.RESTORING_SESSION else Stage.CONNECTING, hadSession = event.hasSession) else state
        // A failed page still reports started and finished: only a retry leaves a failure.
        is Event.PageStarted -> when {
            state.failed -> state
            state.covering -> state.copy(stage = if (state.stage == Stage.RETRYING) Stage.RETRYING else Stage.CONNECTING, pageLoaded = false, hadSession = event.hasSession)
            else -> state.copy(hadSession = event.hasSession)
        }
        is Event.PageFinished -> when {
            state.failed || !state.covering -> state
            !event.reportsReady -> state.copy(stage = Stage.READY, pageLoaded = true)
            state.stage == Stage.LOADING_DATA -> state.copy(pageLoaded = true)
            else -> state.copy(stage = Stage.LOADING_DATA, pageLoaded = true)
        }
        Event.LoadingData -> if (state.covering && !state.failed) state.copy(stage = Stage.LOADING_DATA) else state
        is Event.WebReady -> when {
            state.failed -> state
            event.signedOut && state.hadSession -> state.copy(stage = Stage.AUTH_EXPIRED, pageLoaded = true)
            state.stage == Stage.AUTH_EXPIRED && event.signedOut -> state
            else -> state.copy(stage = Stage.READY, pageLoaded = true)
        }
        is Event.LoadFailed -> state.copy(stage = unreachable(event.online), pageLoaded = false)
        Event.ServerError -> state.copy(stage = Stage.SERVER_UNAVAILABLE, pageLoaded = false)
        // The page is up but never reported in: show it rather than holding the screen forever.
        is Event.TimedOut -> when {
            !state.covering || state.failed -> state
            state.pageLoaded -> state.copy(stage = Stage.READY)
            else -> state.copy(stage = unreachable(event.online))
        }
        Event.DeviceFailed -> state.copy(stage = Stage.FAILED, pageLoaded = false)
        Event.Retry -> if (state.failed) state.copy(stage = Stage.RETRYING, pageLoaded = false) else state
    }

    /** How long the watchdog waits in this state, or null when it shouldn't run. */
    fun watchdogMs(state: State): Long? = when {
        !state.covering || state.failed -> null
        state.pageLoaded -> READY_WAIT_MS
        else -> LOAD_WAIT_MS
    }

    /** Whether this page hosts the app screen, which reports when it's ready. */
    fun pageReportsReady(path: String?) = path == null || path == "" || path == "/" || path == "/login"

    const val LOAD_WAIT_MS = 25_000L
    const val READY_WAIT_MS = 12_000L
}
