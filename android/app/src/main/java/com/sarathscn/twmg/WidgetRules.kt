package com.sarathscn.twmg

import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.WeekFields
import java.util.Locale

/** What the home screen widgets show, as pure rules with no Android types so they can be unit tested. */
object WidgetRules {
    const val CELLS = 42

    data class Cell(val day: Int, val date: LocalDate?, val count: Int, val isToday: Boolean)

    /** A month laid out as six weeks; cells outside the month have no date and stay blank. */
    fun monthCells(month: YearMonth, today: LocalDate, counts: Map<String, Int>, locale: Locale = Locale.getDefault()): List<Cell> {
        val firstDay = WeekFields.of(locale).firstDayOfWeek
        val offset = (month.atDay(1).dayOfWeek.value - firstDay.value + 7) % 7
        return List(CELLS) { i ->
            val n = i - offset + 1
            if (n < 1 || n > month.lengthOfMonth()) Cell(0, null, 0, false)
            else month.atDay(n).let { date -> Cell(n, date, counts[date.toString()] ?: 0, date == today) }
        }
    }

    enum class Mode {
        /** Nothing to show: signed out, or signed in on no profile yet. */
        SIGNED_OUT,
        /** App lock is on: the home screen must not reveal what the app keeps locked. */
        LOCKED,
        SHOWING
    }

    fun mode(signedIn: Boolean, appLock: Boolean) = when {
        !signedIn -> Mode.SIGNED_OUT
        appLock -> Mode.LOCKED
        else -> Mode.SHOWING
    }

    /** The profile tile's letter: the first character of the name, whole even for emoji or other scripts. */
    fun initial(name: String): String {
        val t = name.trim()
        if (t.isEmpty()) return "?"
        return t.substring(0, t.offsetByCodePoints(0, 1)).uppercase()
    }

    /** Only well-formed links open: the app's own host, over HTTPS, with one of the known destinations. */
    val TARGETS = setOf("add-transaction", "calendar", "switch-profile")
    fun isOpenTarget(value: String?) = value != null && value in TARGETS

    /** A colour from stored data, or null when it isn't a plain #RRGGBB. */
    fun parseColor(value: String?): Int? = value?.takeIf { Regex("^#[0-9a-fA-F]{6}$").matches(it) }?.let { (0xFF000000 or it.substring(1).toLong(16)).toInt() }
}
