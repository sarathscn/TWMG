package com.sarathscn.twmg

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Offline change queue. The web app records each change here the moment it is made; this file
 * (app-private storage, excluded from backups) survives the app closing and the phone restarting,
 * and [OutboxWorker] uploads it in order whenever there is a connection. Nothing is dropped
 * silently: a change the server refuses stays in the queue, marked failed, until the user retries
 * or discards it.
 */
object SyncQueue {
    private const val WORK = "twmg-outbox"
    private const val PREFS = "twmg-sync"
    private val lock = Any()

    private fun file(context: Context) = File(context.noBackupFilesDir, "sync-queue.json")
    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun all(context: Context): JSONArray = synchronized(lock) {
        try { file(context).takeIf { it.exists() }?.readText()?.let { JSONArray(it) } ?: JSONArray() } catch (e: Exception) { JSONArray() }
    }

    private fun save(context: Context, ops: JSONArray) = synchronized(lock) {
        val target = file(context)
        val temp = File(target.parentFile, target.name + ".tmp")
        temp.writeText(ops.toString())
        if (!temp.renameTo(target)) { target.delete(); temp.renameTo(target) }
    }

    private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
    private fun rule(o: JSONObject) = SyncRules.Op(o.getString("opId"), o.getString("user"), o.optString("id"), o.optString("base").ifEmpty { null }, o.optString("state") == "failed")

    /** Adds a change from the web app. Returns false for malformed input; a repeat of the same change is ignored. */
    fun add(context: Context, json: String): Boolean = synchronized(lock) {
        val op = try { JSONObject(json) } catch (e: Exception) { return false }
        if (op.optString("opId").isEmpty() || op.optString("user").isEmpty() || op.optString("profile").isEmpty() || op.optString("kind").isEmpty() || op.optString("id").isEmpty()) return false
        if (op.optString("action") !in setOf("save", "delete")) return false
        val ops = all(context)
        if (ops.objects().any { it.getString("opId") == op.getString("opId") }) return true
        // JSON null would read back as the text "null"; a change without a base simply has none.
        if (op.isNull("base")) op.remove("base")
        op.put("state", "pending")
        ops.put(op)
        save(context, ops)
        true
    }

    fun list(context: Context, user: String): JSONArray = JSONArray(all(context).objects().filter { it.optString("user") == user })

    fun remove(context: Context, opId: String) = synchronized(lock) { save(context, JSONArray(all(context).objects().filter { it.optString("opId") != opId })) }

    /** Retry a failed change; `keepMine` sends it without its base version, overriding the other device's edit. */
    fun retry(context: Context, opId: String, keepMine: Boolean) = synchronized(lock) {
        val ops = all(context)
        ops.objects().filter { it.optString("opId") == opId }.forEach { it.put("state", "pending"); it.remove("error"); it.remove("conflict"); if (keepMine) it.remove("base") }
        save(context, ops)
    }

    private fun update(context: Context, opId: String, change: (JSONObject) -> Unit) = synchronized(lock) {
        val ops = all(context)
        ops.objects().filter { it.optString("opId") == opId }.forEach(change)
        save(context, ops)
    }

    /** Signing out removes this account's queued changes (the web app asks first if any are unsynced). */
    fun clearUser(context: Context, user: String) = synchronized(lock) {
        save(context, JSONArray(all(context).objects().filter { it.optString("user") != user }))
        if (activeUser(context) == user) prefs(context).edit().remove("user").apply()
    }

    /** The signed-in account whose changes may be uploaded with the current session cookie. */
    fun setActiveUser(context: Context, user: String) { prefs(context).edit().putString("user", user).putString("state", "idle").apply() }
    fun activeUser(context: Context) = prefs(context).getString("user", null)

    fun status(context: Context): JSONObject {
        val user = activeUser(context) ?: ""
        val mine = list(context, user).objects()
        val p = prefs(context)
        return JSONObject().put("state", p.getString("state", "idle")).put("pending", mine.count { it.optString("state") != "failed" })
            .put("failed", mine.count { it.optString("state") == "failed" }).put("lastSync", p.getLong("lastSync", 0L)).put("error", p.getString("error", ""))
    }

    fun setState(context: Context, state: String, error: String = "") {
        val edit = prefs(context).edit().putString("state", state).putString("error", error)
        if (state == "idle") edit.putLong("lastSync", System.currentTimeMillis())
        edit.apply()
        SyncBus.emit(status(context))
    }

    /** Upload as soon as there is a connection; runs after any upload already in progress. */
    fun schedule(context: Context) {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        SyncBus.emit(status(context))
    }

    /** Uploads queued changes in order. Returns false when it should be retried later. */
    fun flush(context: Context): Boolean {
        val user = activeUser(context) ?: return true
        val base = BuildConfig.APP_URL
        setState(context, "syncing")
        while (true) {
            val ops = all(context).objects()
            val next = SyncRules.next(ops.map(::rule), user) ?: break
            val op = ops.first { it.getString("opId") == next.opId }
            val body = JSONObject().put("kind", op.getString("kind")).put("action", op.getString("action")).put("profile", op.getString("profile")).put("id", op.getString("id"))
            op.optJSONObject("value")?.let { body.put("value", it) }
            if (op.optString("base").isNotEmpty()) body.put("base", op.getString("base"))
            val (status, text) = try {
                val connection = (URL("$base/api/finance").openConnection() as HttpURLConnection).apply {
                    requestMethod = "PUT"; connectTimeout = 15_000; readTimeout = 30_000; doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                    // The API only accepts writes from its own origin.
                    setRequestProperty("Origin", base)
                    CookieManager.getInstance().getCookie(base)?.let { setRequestProperty("Cookie", it) }
                }
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
                val code = connection.responseCode
                code to ((if (code < 400) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: "")
            } catch (e: IOException) { 0 to "" }
            val reply = try { JSONObject(text) } catch (e: Exception) { JSONObject() }
            when (SyncRules.classify(status)) {
                SyncRules.Outcome.DONE -> {
                    remove(context, op.getString("opId"))
                    val touched = reply.optJSONArray("touched")
                    if (touched != null && touched.length() > 0) {
                        val at = (0 until touched.length()).associate { touched.getJSONObject(it).getString("id") to touched.getJSONObject(it).getString("at") }
                        synchronized(lock) {
                            val rest = all(context)
                            val rebased = SyncRules.rebase(rest.objects().map(::rule), at).associateBy { it.opId }
                            rest.objects().forEach { o -> rebased[o.getString("opId")]?.base?.let { o.put("base", it) } }
                            save(context, rest)
                        }
                    }
                    SyncBus.emit(status(context))
                }
                SyncRules.Outcome.RETRY_LATER -> { setState(context, "offline"); return false }
                SyncRules.Outcome.NEEDS_SIGN_IN -> { setState(context, "auth", "Sign in again to upload your changes."); return true }
                SyncRules.Outcome.CONFLICT, SyncRules.Outcome.REJECTED -> {
                    val conflict = status == 409
                    update(context, op.getString("opId")) { it.put("state", "failed").put("error", reply.optString("error").ifEmpty { "The server could not save this change (HTTP $status)." }).put("conflict", conflict) }
                    setState(context, "failed", reply.optString("error"))
                    return true
                }
            }
        }
        setState(context, "idle")
        return true
    }
}

/** Delivers sync status to the open app, on the main thread. */
object SyncBus {
    @Volatile var listener: ((JSONObject) -> Unit)? = null
    private val main = Handler(Looper.getMainLooper())
    fun emit(status: JSONObject) { val l = listener ?: return; main.post { l(status) } }
}

class OutboxWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = if (SyncQueue.flush(applicationContext)) Result.success() else Result.retry()
}
