package com.sarathscn.twmg

import com.sarathscn.twmg.StartupRules.Event
import com.sarathscn.twmg.StartupRules.Stage
import com.sarathscn.twmg.StartupRules.State
import com.sarathscn.twmg.StartupRules.covering
import com.sarathscn.twmg.StartupRules.failed
import com.sarathscn.twmg.StartupRules.next
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StartupRulesTest {
    private fun run(vararg events: Event, from: State = State()) = events.fold(from, ::next)

    @Test fun signedInStartWalksThroughEachStageToReady() {
        var s = next(State(), Event.Begin(hasSession = true))
        assertEquals(Stage.RESTORING_SESSION, s.stage)
        s = next(s, Event.PageStarted(true)); assertEquals(Stage.CONNECTING, s.stage)
        s = next(s, Event.LoadingData); assertEquals(Stage.LOADING_DATA, s.stage)
        s = next(s, Event.PageFinished(true)); assertEquals(Stage.LOADING_DATA, s.stage); assertTrue(s.covering)
        s = next(s, Event.WebReady(signedOut = false)); assertEquals(Stage.READY, s.stage); assertFalse(s.covering)
    }

    @Test fun pageFinishingIsNotEnoughWhenTheAppReportsReady() {
        assertTrue(run(Event.Begin(false), Event.PageStarted(false), Event.PageFinished(true)).covering)
    }

    @Test fun pagesThatNeverReportLeaveWhenLoaded() {
        assertEquals(Stage.READY, run(Event.Begin(false), Event.PageStarted(false), Event.PageFinished(false)).stage)
        assertFalse(StartupRules.pageReportsReady("/auth/reset"))
        assertTrue(StartupRules.pageReportsReady("/")); assertTrue(StartupRules.pageReportsReady("/login"))
    }

    @Test fun readyStaysReadyWhenReportedTwiceOrWhenTheAppNavigates() {
        val ready = run(Event.Begin(false), Event.PageStarted(false), Event.WebReady(false))
        assertEquals(ready, next(ready, Event.WebReady(false)))
        val moved = run(Event.PageStarted(false), Event.PageFinished(true), from = ready)
        assertFalse("signing out reloads the page without bringing the splash back", moved.covering)
    }

    @Test fun signedOutWithASavedSessionMeansItExpired() {
        val s = run(Event.Begin(true), Event.PageStarted(true), Event.WebReady(signedOut = true))
        assertEquals(Stage.AUTH_EXPIRED, s.stage); assertFalse("the sign-in screen shows", s.covering)
        assertEquals(Stage.AUTH_EXPIRED, next(s, Event.WebReady(signedOut = true)).stage)
    }

    @Test fun signedOutWithNoSessionIsAFirstOpenNotAnExpiry() {
        assertEquals(Stage.READY, run(Event.Begin(false), Event.PageStarted(false), Event.WebReady(signedOut = true)).stage)
    }

    @Test fun signingOutAfterReadyIsNotAnExpiry() {
        val ready = run(Event.Begin(true), Event.PageStarted(true), Event.WebReady(false))
        assertEquals(Stage.READY, run(Event.PageStarted(false), Event.WebReady(signedOut = true), from = ready).stage)
    }

    @Test fun anExpiryAfterReadyIsReported() {
        val ready = run(Event.Begin(true), Event.PageStarted(true), Event.WebReady(false))
        assertEquals(Stage.AUTH_EXPIRED, next(ready, Event.WebReady(signedOut = true)).stage)
    }

    @Test fun signingBackInClearsAnExpirySoTheNextOneIsNoticed() {
        val expired = run(Event.Begin(true), Event.PageStarted(true), Event.WebReady(signedOut = true))
        val back = next(expired, Event.WebReady(signedOut = false)); assertEquals(Stage.READY, back.stage)
        assertEquals(Stage.AUTH_EXPIRED, next(back, Event.WebReady(signedOut = true)).stage)
    }

    @Test fun failuresNameTheCause() {
        assertEquals(Stage.NO_INTERNET, next(State(), Event.LoadFailed(online = false)).stage)
        assertEquals(Stage.SERVER_UNAVAILABLE, next(State(), Event.LoadFailed(online = true)).stage)
        assertEquals(Stage.SERVER_UNAVAILABLE, next(State(), Event.ServerError).stage)
        assertEquals(Stage.FAILED, next(State(), Event.DeviceFailed).stage)
    }

    @Test fun aFailedPageFinishingDoesNotHideTheError() {
        val s = run(Event.PageStarted(true), Event.LoadFailed(false), Event.PageStarted(true), Event.PageFinished(true), Event.WebReady(false))
        assertEquals(Stage.NO_INTERNET, s.stage); assertTrue(s.failed)
    }

    @Test fun onlyARetryLeavesAFailureAndItRecovers() {
        val failed = next(State(), Event.LoadFailed(false))
        val retrying = next(failed, Event.Retry); assertEquals(Stage.RETRYING, retrying.stage)
        assertEquals("a second tap changes nothing", retrying, next(retrying, Event.Retry))
        val started = next(retrying, Event.PageStarted(false)); assertEquals(Stage.RETRYING, started.stage)
        assertEquals(Stage.READY, next(started, Event.WebReady(false)).stage)
        assertEquals("retrying can fail again", Stage.SERVER_UNAVAILABLE, next(started, Event.LoadFailed(true)).stage)
    }

    @Test fun aLaterFailureBringsTheScreenBackWithRetry() {
        val ready = run(Event.PageStarted(false), Event.WebReady(false))
        val s = next(ready, Event.LoadFailed(false)); assertTrue(s.covering); assertTrue(s.failed)
    }

    @Test fun theWatchdogNeverLeavesTheScreenUp() {
        val loading = run(Event.Begin(false), Event.PageStarted(false))
        assertEquals(StartupRules.LOAD_WAIT_MS, StartupRules.watchdogMs(loading))
        assertEquals(Stage.SERVER_UNAVAILABLE, next(loading, Event.TimedOut(online = true)).stage)
        assertEquals(Stage.NO_INTERNET, next(loading, Event.TimedOut(online = false)).stage)
        val loaded = next(loading, Event.PageFinished(true))
        assertEquals(StartupRules.READY_WAIT_MS, StartupRules.watchdogMs(loaded))
        assertEquals("a loaded page is shown, not an error", Stage.READY, next(loaded, Event.TimedOut(online = false)).stage)
    }

    @Test fun theWatchdogStopsOnceThereIsNothingToWaitFor() {
        assertNull(StartupRules.watchdogMs(run(Event.WebReady(false))))
        assertNull(StartupRules.watchdogMs(run(Event.LoadFailed(false))))
        val ready = run(Event.WebReady(false)); assertEquals(ready, next(ready, Event.TimedOut(true)))
    }
}
