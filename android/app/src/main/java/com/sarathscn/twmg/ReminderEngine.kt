package com.sarathscn.twmg

import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/** One open obligation from /api/reminders (anything completed is simply absent). */
data class ReminderItem(val id: String, val title: String, val body: String, val due: LocalDate, val view: String)

/** Stage wording, already translated by the server. */
data class ReminderLabels(val inDays: String, val tomorrow: String, val today: String, val overdue: String, val overdueOne: String) {
    companion object { val ENGLISH = ReminderLabels("Due in {0} days", "Due tomorrow", "Due today", "Overdue by {0} days", "Overdue by 1 day") }
}

/**
 * Pure scheduling rules, with no Android dependencies so they are unit-tested on the JVM.
 * Each item notifies 7, 3 and 1 day before its due date, on the day, then daily while overdue
 * (up to [OVERDUE_DAYS]). Every stage is delivered at most once, keyed "id@date".
 */
object ReminderEngine {
    const val LEAD_DAYS = 7L
    const val OVERDUE_DAYS = 30L
    val NOTIFY_AT: LocalTime = LocalTime.of(9, 0)
    private val CATCH_UP: Duration = Duration.ofMinutes(1)

    fun stageDays(due: LocalDate): List<LocalDate> =
        listOf(due.minusDays(LEAD_DAYS), due.minusDays(3), due.minusDays(1), due) + (1..OVERDUE_DAYS).map { due.plusDays(it) }

    fun stageKey(item: ReminderItem, day: LocalDate) = "${item.id}@$day"

    /** Items with an undelivered stage on [day]. */
    fun dueOn(items: List<ReminderItem>, day: LocalDate, delivered: Set<String>): List<ReminderItem> =
        items.filter { day in stageDays(it.due) && stageKey(it, day) !in delivered }

    /**
     * When the single reminder alarm should next fire. A stage whose 09:00 has already passed today
     * (phone was off, app installed late, clock changed) is caught up one minute from now.
     */
    fun nextFire(items: List<ReminderItem>, now: ZonedDateTime, delivered: Set<String>): ZonedDateTime? {
        val zone: ZoneId = now.zone
        val today = now.toLocalDate()
        if (dueOn(items, today, delivered).isNotEmpty()) {
            val at = today.atTime(NOTIFY_AT).atZone(zone)
            return if (now.isBefore(at)) at else now.plus(CATCH_UP)
        }
        val next = items.flatMap { stageDays(it.due) }.filter { it.isAfter(today) }.minOrNull() ?: return null
        return next.atTime(NOTIFY_AT).atZone(zone)
    }

    fun stageText(item: ReminderItem, day: LocalDate, labels: ReminderLabels): String {
        val days = ChronoUnit.DAYS.between(day, item.due)
        return when {
            days > 1 -> labels.inDays.replace("{0}", days.toString())
            days == 1L -> labels.tomorrow
            days == 0L -> labels.today
            days == -1L -> labels.overdueOne
            else -> labels.overdue.replace("{0}", (-days).toString())
        }
    }

    /** Delivery keys older than the longest possible stage window can be forgotten. */
    fun prune(delivered: Set<String>, today: LocalDate): Set<String> = delivered.filterTo(mutableSetOf()) { key ->
        val day = runCatching { LocalDate.parse(key.substringAfterLast('@')) }.getOrNull()
        day != null && !day.isBefore(today.minusDays(LEAD_DAYS + OVERDUE_DAYS + 1))
    }
}
