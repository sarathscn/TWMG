package com.sarathscn.twmg

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class ReminderEngineTest {
    private val zone = ZoneId.of("Asia/Kolkata")
    private val due = LocalDate.of(2026, 11, 10)
    private val bill = ReminderItem("p:recurring:r1", "Internet is due", "₹999", due, "Recurring")
    private fun at(day: LocalDate, h: Int, m: Int = 0) = ZonedDateTime.of(day.atTime(h, m), zone)

    @Test fun firstReminderIsSevenDaysBefore() {
        val next = ReminderEngine.nextFire(listOf(bill), at(LocalDate.of(2026, 10, 25), 12), emptySet())
        assertEquals(at(LocalDate.of(2026, 11, 3), 9), next)
    }

    @Test fun stagesAreSevenThreeOneDueThenDailyOverdue() {
        val days = ReminderEngine.stageDays(due)
        assertEquals(listOf(due.minusDays(7), due.minusDays(3), due.minusDays(1), due, due.plusDays(1), due.plusDays(2)), days.take(6))
        assertEquals(due.plusDays(30), days.last())
        assertTrue(LocalDate.of(2026, 11, 5) !in days) // no daily nagging before the due date
    }

    @Test fun eachStageIsDeliveredOnlyOnce() {
        val day = due.minusDays(7)
        assertEquals(listOf(bill), ReminderEngine.dueOn(listOf(bill), day, emptySet()))
        val delivered = setOf(ReminderEngine.stageKey(bill, day))
        assertTrue(ReminderEngine.dueOn(listOf(bill), day, delivered).isEmpty())
        // Already delivered today: the next alarm is the following stage, not another one today.
        assertEquals(at(due.minusDays(3), 9), ReminderEngine.nextFire(listOf(bill), at(day, 15), delivered))
    }

    @Test fun missedStageTodayIsCaughtUpPromptly() {
        val now = at(due, 18, 30)
        assertEquals(now.plusMinutes(1), ReminderEngine.nextFire(listOf(bill), now, emptySet()))
        assertEquals(at(due, 9), ReminderEngine.nextFire(listOf(bill), at(due, 7), emptySet()))
    }

    @Test fun overdueFollowUpsContinueDailyThenStop() {
        assertEquals(at(due.plusDays(5), 9), ReminderEngine.nextFire(listOf(bill), at(due.plusDays(4), 10), setOf(ReminderEngine.stageKey(bill, due.plusDays(4)))))
        assertNull(ReminderEngine.nextFire(listOf(bill), at(due.plusDays(31), 10), emptySet()))
    }

    @Test fun completedItemsStopImmediately() {
        // The server stops returning a completed item, so nothing is left to schedule.
        assertNull(ReminderEngine.nextFire(emptyList(), at(due, 8), emptySet()))
        assertTrue(ReminderEngine.dueOn(emptyList(), due, emptySet()).isEmpty())
    }

    @Test fun clockOrTimeZoneChangesUseTheNewLocalDate() {
        val tokyo = ZonedDateTime.of(due.minusDays(3).atTime(8, 0), ZoneId.of("Asia/Tokyo"))
        assertEquals(ZonedDateTime.of(due.minusDays(3).atTime(9, 0), ZoneId.of("Asia/Tokyo")), ReminderEngine.nextFire(listOf(bill), tokyo, emptySet()))
    }

    @Test fun stageWordingFollowsDistanceToDueDate() {
        val l = ReminderLabels.ENGLISH
        assertEquals("Due in 7 days", ReminderEngine.stageText(bill, due.minusDays(7), l))
        assertEquals("Due tomorrow", ReminderEngine.stageText(bill, due.minusDays(1), l))
        assertEquals("Due today", ReminderEngine.stageText(bill, due, l))
        assertEquals("Overdue by 1 day", ReminderEngine.stageText(bill, due.plusDays(1), l))
        assertEquals("Overdue by 4 days", ReminderEngine.stageText(bill, due.plusDays(4), l))
    }

    @Test fun oldDeliveryKeysArePruned() {
        val today = LocalDate.of(2026, 12, 31)
        val kept = ReminderEngine.prune(setOf("a@2026-12-20", "b@2026-01-01", "garbage"), today)
        assertEquals(setOf("a@2026-12-20"), kept)
    }

    @Test fun manyItemsShareOneAlarmAtTheEarliestStage() {
        val card = ReminderItem("p:card:c", "Card payment due", "₹5,000", LocalDate.of(2026, 11, 2), "Credit cards")
        assertEquals(at(LocalDate.of(2026, 10, 26), 9), ReminderEngine.nextFire(listOf(bill, card), at(LocalDate.of(2026, 10, 25), 12), emptySet()))
    }
}
