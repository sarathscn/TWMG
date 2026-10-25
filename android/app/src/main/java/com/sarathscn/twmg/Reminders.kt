package com.sarathscn.twmg

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Local bill reminders. The web app sends upcoming due dates; they are stored on the device
 * and scheduled with inexact alarms (battery friendly, delivered in Doze maintenance windows),
 * so reminders still arrive when the app is closed or the phone is offline.
 */
object Reminders {
    const val CHANNEL = "reminders"
    private const val PREFS = "twmg"
    private const val KEY_ITEMS = "reminder_items"
    private const val KEY_IDS = "reminder_ids"
    private const val KEY_ENABLED = "reminders_enabled"
    private val REMIND_AT: LocalTime = LocalTime.of(9, 0)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    fun enabled(context: Context) = prefs(context).getBoolean(KEY_ENABLED, false)
    fun setEnabled(context: Context, on: Boolean) { prefs(context).edit().putBoolean(KEY_ENABLED, on).apply(); reschedule(context) }

    fun createChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = context.getString(R.string.channel_reminders_description) }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** Replace the stored reminders with the latest list from the web app and reschedule. */
    fun store(context: Context, json: String) {
        val items = runCatching { JSONArray(json) }.getOrNull() ?: return
        if (items.length() > 100) return
        prefs(context).edit().putString(KEY_ITEMS, items.toString()).apply()
        reschedule(context)
    }

    fun reschedule(context: Context) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val prefs = prefs(context)
        // Cancel everything scheduled last time, then schedule the current list.
        prefs.getStringSet(KEY_IDS, emptySet())!!.forEach { alarms.cancel(pending(context, it, null)) }
        val scheduled = mutableSetOf<String>()
        if (enabled(context)) {
            val items = runCatching { JSONArray(prefs.getString(KEY_ITEMS, "[]")) }.getOrDefault(JSONArray())
            val now = System.currentTimeMillis()
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                val id = item.optString("id").take(120)
                if (id.isBlank()) continue
                val date = runCatching { LocalDate.parse(item.optString("date")) }.getOrNull() ?: continue
                val at = date.atTime(REMIND_AT).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                if (at <= now) continue
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, id, item.toString()))
                scheduled += id
            }
        }
        prefs.edit().putStringSet(KEY_IDS, scheduled).apply()
    }

    private fun pending(context: Context, id: String, payload: String?): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).setAction("com.sarathscn.twmg.REMIND.$id")
        if (payload != null) intent.putExtra("item", payload)
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun post(context: Context, payload: String) {
        if (!enabled(context) || !NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        val item = runCatching { org.json.JSONObject(payload) }.getOrNull() ?: return
        val view = item.optString("view").takeIf { it.matches(Regex("[A-Za-z &]{1,40}")) } ?: "Overview"
        val open = Intent(context, MainActivity::class.java)
            .setData(Uri.parse(BuildConfig.APP_URL).buildUpon().appendQueryParameter("view", view).build())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val tap = PendingIntent.getActivity(context, item.optString("id").hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(context.getColor(R.color.brand))
            .setContentTitle(item.optString("title").take(120))
            .setContentText(item.optString("body").take(200))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        try { NotificationManagerCompat.from(context).notify(item.optString("id").hashCode(), notification) } catch (e: SecurityException) { /* permission revoked */ }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { intent.getStringExtra("item")?.let { Reminders.post(context, it) } }
}

/** Alarms don't survive a reboot or app update; restore them from the stored list. */
class RescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) Reminders.reschedule(context)
    }
}
