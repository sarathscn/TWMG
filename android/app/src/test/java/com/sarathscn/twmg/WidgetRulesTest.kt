package com.sarathscn.twmg

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

class WidgetRulesTest {
    private val nov = YearMonth.of(2026, 11)
    private val today = LocalDate.of(2026, 11, 3)

    @Test fun aMonthFitsSixWeeksStartingOnTheRightDay() {
        val uk = WidgetRules.monthCells(nov, today, emptyMap(), Locale.UK) // weeks start on Monday; 1 Nov 2026 is a Sunday
        assertEquals(42, uk.size); assertEquals(0, uk[5].day); assertEquals(1, uk[6].day)
        val us = WidgetRules.monthCells(nov, today, emptyMap(), Locale.US) // weeks start on Sunday
        assertEquals(1, us[0].day); assertEquals(30, us[29].day); assertEquals(0, us[30].day); assertNull(us[30].date)
    }

    @Test fun longestMonthWithTheLatestStartStillFits() {
        val cells = WidgetRules.monthCells(YearMonth.of(2026, 8), LocalDate.of(2026, 8, 1), emptyMap(), Locale.UK) // Starts on a Saturday, 31 days
        assertEquals(31, cells.count { it.date != null })
    }

    @Test fun countsAndTodayLandOnTheirOwnDays() {
        val cells = WidgetRules.monthCells(nov, today, mapOf("2026-11-03" to 2, "2026-10-03" to 9), Locale.US)
        val third = cells.first { it.day == 3 }
        assertEquals(2, third.count); assertTrue(third.isToday)
        assertEquals(1, cells.count { it.isToday }); assertEquals(2, cells.sumOf { it.count })
    }

    @Test fun aLockedAppRevealsNothingAndSignedOutComesFirst() {
        assertEquals(WidgetRules.Mode.SIGNED_OUT, WidgetRules.mode(signedIn = false, appLock = true))
        assertEquals(WidgetRules.Mode.LOCKED, WidgetRules.mode(signedIn = true, appLock = true))
        assertEquals(WidgetRules.Mode.SHOWING, WidgetRules.mode(signedIn = true, appLock = false))
    }

    @Test fun profileInitialHandlesAnyName() {
        assertEquals("P", WidgetRules.initial(" personal"))
        assertEquals("?", WidgetRules.initial("  "))
        assertEquals("😀", WidgetRules.initial("😀 Family"))
    }

    @Test fun onlyKnownDestinationsOpen() {
        assertTrue(WidgetRules.isOpenTarget("calendar")); assertFalse(WidgetRules.isOpenTarget("delete")); assertFalse(WidgetRules.isOpenTarget(null))
    }

    @Test fun coloursMustBePlainHex() {
        assertEquals(0xFF2D6048.toInt(), WidgetRules.parseColor("#2d6048"))
        assertNull(WidgetRules.parseColor("red")); assertNull(WidgetRules.parseColor("")); assertNull(WidgetRules.parseColor(null))
    }
}
