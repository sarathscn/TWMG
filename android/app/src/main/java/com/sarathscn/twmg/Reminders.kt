package com.sarathscn.twmg

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * Financial reminders on the phone. The server (/api/reminders) is the source of truth: it returns
 * only open obligations, so a bill paid on any device drops out on the next sync and its
 * notification is dismissed. Items are cached so reminders still arrive offline.
 *
 * One inexact alarm is armed for the next stage (battery friendly, no exact-alarm permission);
 * when it fires, [DeliverWorker] refreshes from the server, posts that day's stages and re-arms.
 * [SyncWorker] also refreshes every 12 hours and whenever the web app's data changes.
 */
object Reminders {
    const val CHANNEL = "reminders"
    private const val PREFS = "twmg"
    private const val KEY_ITEMS = "reminder_items"
    private const val KEY_LABELS = "reminder_labels"
    private const val KEY_DELIVERED = "reminder_delivered"
    private const val KEY_ENABLED = "reminders_enabled"
    private const val KEY_LANG = "reminder_lang"
    private const val ALARM_ID = 7001
    private const val SYNC_PERIODIC = "reminders-sync-periodic"
    private const val SYNC_NOW = "reminders-sync-now"
    private const val DELIVER = "reminders-deliver"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    fun enabled(context: Context) = prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, on: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, on).apply()
        val work = WorkManager.getInstance(context)
        if (on) {
            work.enqueueUniquePeriodicWork(SYNC_PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<SyncWorker>(12, TimeUnit.HOURS).setConstraints(online()).build())
            requestSync(context, null)
        } else {
            work.cancelUniqueWork(SYNC_PERIODIC)
            cancelAlarm(context)
            items(context).forEach { NotificationManagerCompat.from(context).cancel(notificationId(it.id)) }
        }
    }

    fun createChannel(context: Context) {
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = context.getString(R.string.channel_reminders_description) }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** Refresh from the server soon (the web app calls this after every data change). */
    fun requestSync(context: Context, lang: String?) {
        if (lang != null && lang.matches(Regex("[a-z]{2}"))) prefs(context).edit().putString(KEY_LANG, lang).apply()
        if (!enabled(context)) return
        WorkManager.getInstance(context).enqueueUniqueWork(SYNC_NOW, ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online()).build())
    }

    private fun online() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    // ---- Storage ----------------------------------------------------------------------------
    fun items(context: Context): List<ReminderItem> = parseItems(prefs(context).getString(KEY_ITEMS, "[]")!!)

    private fun labels(context: Context): ReminderLabels = runCatching {
        val o = JSONObject(prefs(context).getString(KEY_LABELS, null)!!)
        ReminderLabels(o.getString("inDays"), o.getString("tomorrow"), o.getString("today"), o.getString("overdue"), o.getString("overdueOne"))
    }.getOrDefault(ReminderLabels.ENGLISH)

    private fun delivered(context: Context): Set<String> = prefs(context).getStringSet(KEY_DELIVERED, emptySet())!!.toSet()

    fun parseItems(json: String): List<ReminderItem> {
        val array = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        return (0 until minOf(array.length(), 200)).mapNotNull { i ->
            val o = array.optJSONObject(i) ?: return@mapNotNull null
            val due = runCatching { LocalDate.parse(o.optString("due")) }.getOrNull() ?: return@mapNotNull null
            val id = o.optString("id").take(200)
            if (id.isBlank()) null else ReminderItem(id, o.optString("title").take(120), o.optString("body").take(200), due, o.optString("view").take(40))
        }
    }

    /** Fetches /api/reminders with the WebView's sign-in cookies. Returns false when offline/failed. */
    fun sync(context: Context): Boolean {
        val lang = prefs(context).getString(KEY_LANG, "en")
        val base = BuildConfig.APP_URL
        val cookies = CookieManager.getInstance()
        val connection = (URL("$base/api/reminders?lang=$lang").openConnection() as HttpURLConnection).apply {
            connectTimeout = 8_000; readTimeout = 8_000; instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
            cookies.getCookie(base)?.let { setRequestProperty("Cookie", it) }
        }
        return try {
            val code = connection.responseCode
            // Keep the refreshed Supabase session the server may have issued.
            connection.headerFields["Set-Cookie"]?.forEach { cookies.setCookie(base, it) }
            cookies.flush()
            when (code) {
                200 -> { store(context, connection.inputStream.bufferedReader().use { it.readText() }); true }
                401 -> { store(context, """{"items":[]}"""); true } // signed out: nothing to remind about
                else -> false
            }
        } catch (e: Exception) { false } finally { connection.disconnect() }
    }

    /** Saves a server response, dismisses notifications for anything completed, and re-arms. */
    fun store(context: Context, body: String) {
        val o = runCatching { JSONObject(body) }.getOrNull() ?: return
        val fresh = parseItems(o.optJSONArray("items")?.toString() ?: "[]")
        val gone = items(context).map { it.id }.toSet() - fresh.map { it.id }.toSet()
        gone.forEach { NotificationManagerCompat.from(context).cancel(notificationId(it)) }
        prefs(context).edit().putString(KEY_ITEMS, JSONArray(fresh.map { JSONObject().put("id", it.id).put("title", it.title).put("body", it.body).put("due", it.due.toString()).put("view", it.view) }).toString())
            .apply { o.optJSONObject("labels")?.let { putString(KEY_LABELS, it.toString()) } }
            .apply()
        schedule(context)
    }

    // ---- Scheduling and delivery --------------------------------------------------------------
    fun schedule(context: Context) {
        cancelAlarm(context)
        if (!enabled(context)) return
        val next = ReminderEngine.nextFire(items(context), ZonedDateTime.now(), delivered(context)) ?: return
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.toInstant().toEpochMilli(), alarmIntent(context))
    }

    private fun cancelAlarm(context: Context) = context.getSystemService(AlarmManager::class.java).cancel(alarmIntent(context))

    private fun alarmIntent(context: Context) = PendingIntent.getBroadcast(context, ALARM_ID,
        Intent(context, ReminderReceiver::class.java).setAction("com.sarathscn.twmg.REMINDER_ALARM"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun enqueueDelivery(context: Context) =
        WorkManager.getInstance(context).enqueueUniqueWork(DELIVER, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<DeliverWorker>().build())

    /** Posts today's undelivered stages. Each item has one notification that later stages update. */
    fun deliver(context: Context) {
        if (!enabled(context)) return
        val today = LocalDate.now()
        val done = ReminderEngine.prune(delivered(context), today).toMutableSet()
        val canNotify = NotificationManagerCompat.from(context).areNotificationsEnabled()
        for (item in ReminderEngine.dueOn(items(context), today, done)) {
            if (canNotify) post(context, item, ReminderEngine.stageText(item, today, labels(context)))
            done += ReminderEngine.stageKey(item, today)
        }
        prefs(context).edit().putStringSet(KEY_DELIVERED, done).apply()
        schedule(context)
    }

    fun notificationId(id: String) = id.hashCode()

    private fun post(context: Context, item: ReminderItem, stage: String) {
        val view = item.view.takeIf { it.matches(Regex("[A-Za-z &]{1,40}")) } ?: "Overview"
        val open = Intent(context, MainActivity::class.java)
            .setData(Uri.parse(BuildConfig.APP_URL).buildUpon().appendQueryParameter("view", view).build())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val tap = PendingIntent.getActivity(context, notificationId(item.id), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(context.getColor(R.color.brand))
            .setContentTitle(item.title)
            .setContentText("$stage · ${item.body}")
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        try { NotificationManagerCompat.from(context).notify(notificationId(item.id), notification) } catch (e: SecurityException) { /* permission revoked */ }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { Reminders.enqueueDelivery(context) }
}

/** Refreshes from the server when possible (so a bill paid elsewhere isn't announced), then delivers. */
class DeliverWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result { Reminders.sync(applicationContext); Reminders.deliver(applicationContext); return Result.success() }
}

class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = if (Reminders.sync(applicationContext)) { Reminders.deliver(applicationContext); Result.success() } else Result.retry()
}

/** Alarms don't survive reboots, updates or clock/time-zone changes; re-arm and refresh. */
class RescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_DATE_CHANGED)) {
            Reminders.schedule(context)
            Reminders.requestSync(context, null)
        }
    }
}
