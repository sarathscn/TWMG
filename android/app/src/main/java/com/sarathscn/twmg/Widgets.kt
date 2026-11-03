package com.sarathscn.twmg

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * Home screen widgets and the links shared with the launcher shortcuts. The web app holds the data, so
 * it hands over a small summary whenever something changes (see NativeBridge.updateWidgets): a count per
 * day and the active profile's name, never amounts or descriptions. Widgets redraw from that summary, so
 * they use no network and no background work of their own.
 */
object Widgets {
    private const val PREFS = "twmg-widgets"
    private const val STATE = "state"
    private val CALENDAR_CELLS = intArrayOf(
        R.id.cell_0, R.id.cell_1, R.id.cell_2, R.id.cell_3, R.id.cell_4, R.id.cell_5, R.id.cell_6,
        R.id.cell_7, R.id.cell_8, R.id.cell_9, R.id.cell_10, R.id.cell_11, R.id.cell_12, R.id.cell_13,
        R.id.cell_14, R.id.cell_15, R.id.cell_16, R.id.cell_17, R.id.cell_18, R.id.cell_19, R.id.cell_20,
        R.id.cell_21, R.id.cell_22, R.id.cell_23, R.id.cell_24, R.id.cell_25, R.id.cell_26, R.id.cell_27,
        R.id.cell_28, R.id.cell_29, R.id.cell_30, R.id.cell_31, R.id.cell_32, R.id.cell_33, R.id.cell_34,
        R.id.cell_35, R.id.cell_36, R.id.cell_37, R.id.cell_38, R.id.cell_39, R.id.cell_40, R.id.cell_41,
    )
    private val WEEKDAY_CELLS = intArrayOf(R.id.weekday_0, R.id.weekday_1, R.id.weekday_2, R.id.weekday_3, R.id.weekday_4, R.id.weekday_5, R.id.weekday_6)

    /** Opens the app at one destination. FLAG_IMMUTABLE and a fixed URL: nothing can alter where it goes. */
    fun openIntent(context: Context, target: String): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_URL}/?open=$target"), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(context, target.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Saves the summary and redraws, but only when it actually changed. */
    fun update(context: Context, json: String) {
        val state = try { JSONObject(json) } catch (e: Exception) { return }
        if (prefs(context).getString(STATE, null) == state.toString()) return
        prefs(context).edit().putString(STATE, state.toString()).apply()
        refreshAll(context)
    }

    /** Sign-out: nothing about the account stays on the home screen. */
    fun clear(context: Context) { prefs(context).edit().remove(STATE).apply(); refreshAll(context) }

    fun refreshAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context) ?: return
        for (provider in listOf(CalendarWidget::class.java, AddTransactionWidget::class.java, ProfileWidget::class.java)) {
            val ids = manager.getAppWidgetIds(ComponentName(context, provider))
            if (ids.isNotEmpty()) context.sendBroadcast(Intent(context, provider).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids))
        }
    }

    private fun state(context: Context) = try { JSONObject(prefs(context).getString(STATE, null) ?: "{}") } catch (e: Exception) { JSONObject() }
    private fun appLock(context: Context) = context.getSharedPreferences("twmg", Context.MODE_PRIVATE).getBoolean("app_lock", false)
    private fun mode(context: Context, state: JSONObject) = WidgetRules.mode(state.optBoolean("signedIn"), appLock(context))

    fun calendarViews(context: Context): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_calendar)
        val saved = state(context)
        val showing = mode(context, saved) == WidgetRules.Mode.SHOWING
        val today = LocalDate.now()
        val month = YearMonth.from(today)
        val locale = Locale.getDefault()
        val counts = mutableMapOf<String, Int>()
        if (showing) saved.optJSONObject("days")?.let { days -> days.keys().forEach { counts[it] = days.optInt(it) } }
        val monthName = month.month.getDisplayName(TextStyle.FULL, locale)
        views.setTextViewText(R.id.calendar_title, "$monthName ${month.year}")
        views.setViewVisibility(R.id.calendar_hint, if (showing) View.GONE else View.VISIBLE)
        views.setTextViewText(R.id.calendar_hint, context.getString(if (mode(context, saved) == WidgetRules.Mode.LOCKED) R.string.widget_locked else R.string.widget_sign_in))
        val firstDay = WeekFields.of(locale).firstDayOfWeek
        WEEKDAY_CELLS.forEachIndexed { i, id -> views.setTextViewText(id, firstDay.plus(i.toLong()).getDisplayName(TextStyle.NARROW, locale)) }
        val cells = WidgetRules.monthCells(month, today, counts, locale)
        cells.forEachIndexed { i, cell ->
            val id = CALENDAR_CELLS[i]
            views.setTextViewText(id, if (cell.date == null) "" else cell.day.toString())
            views.setInt(id, "setBackgroundResource", when {
                cell.isToday -> R.drawable.widget_day_today
                cell.count > 0 -> R.drawable.widget_day_marked
                else -> 0
            })
            views.setTextColor(id, context.getColor(if (cell.isToday) R.color.widget_on_brand else R.color.text))
            if (cell.date != null) views.setContentDescription(id, context.resources.getQuantityString(R.plurals.widget_day, cell.count, cell.day, cell.count))
        }
        val marked = cells.count { it.count > 0 }
        views.setContentDescription(R.id.widget_root, when {
            showing -> context.resources.getQuantityString(R.plurals.widget_calendar_description, marked, "$monthName ${month.year}", marked)
            else -> context.getString(R.string.widget_calendar_name)
        })
        views.setOnClickPendingIntent(R.id.widget_root, openIntent(context, "calendar"))
        return views
    }

    fun addViews(context: Context) = RemoteViews(context.packageName, R.layout.widget_add).apply {
        setOnClickPendingIntent(R.id.widget_root, openIntent(context, "add-transaction"))
    }

    fun profileViews(context: Context): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_profile)
        val saved = state(context)
        val mode = mode(context, saved)
        val name = saved.optString("profile")
        val title = when (mode) {
            WidgetRules.Mode.SHOWING -> name
            WidgetRules.Mode.LOCKED -> context.getString(R.string.widget_locked)
            WidgetRules.Mode.SIGNED_OUT -> context.getString(R.string.widget_sign_in)
        }
        views.setTextViewText(R.id.profile_name, title)
        views.setTextViewText(R.id.profile_action, context.getString(if (mode == WidgetRules.Mode.SHOWING) R.string.widget_switch else R.string.app_name))
        views.setTextViewText(R.id.profile_initial, if (mode == WidgetRules.Mode.SHOWING) WidgetRules.initial(name) else "T")
        views.setInt(R.id.profile_initial, "setBackgroundColor", 0)
        views.setInt(R.id.profile_tile, "setColorFilter", (if (mode == WidgetRules.Mode.SHOWING) WidgetRules.parseColor(saved.optString("color")) else null) ?: context.getColor(R.color.brand))
        views.setContentDescription(R.id.widget_root, if (mode == WidgetRules.Mode.SHOWING) context.getString(R.string.widget_profile_description, name) else title)
        views.setOnClickPendingIntent(R.id.widget_root, openIntent(context, "switch-profile"))
        return views
    }
}

class CalendarWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { manager.updateAppWidget(ids, Widgets.calendarViews(context)) }
}

class AddTransactionWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { manager.updateAppWidget(ids, Widgets.addViews(context)) }
}

class ProfileWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { manager.updateAppWidget(ids, Widgets.profileViews(context)) }
}
