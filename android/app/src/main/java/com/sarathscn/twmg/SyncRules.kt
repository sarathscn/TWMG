package com.sarathscn.twmg

/**
 * Pure rules for the offline change queue, kept free of Android types so they can be unit tested.
 * The queue is uploaded strictly in order and stops at the first change the server refuses, so a
 * later change never lands before one it depends on (a transaction before its new account).
 */
object SyncRules {
    enum class Outcome { DONE, RETRY_LATER, NEEDS_SIGN_IN, CONFLICT, REJECTED }

    /** What a server response means for the change that was sent. */
    fun classify(status: Int): Outcome = when {
        status in 200..299 -> Outcome.DONE
        status == 401 || status == 403 -> Outcome.NEEDS_SIGN_IN
        status == 409 -> Outcome.CONFLICT
        status == 408 || status == 429 || status >= 500 || status <= 0 -> Outcome.RETRY_LATER
        else -> Outcome.REJECTED
    }

    data class Op(val opId: String, val user: String, val recordId: String, val base: String?, val failed: Boolean)

    /** The next change to upload for this account, or null when nothing can go yet. */
    fun next(ops: List<Op>, user: String): Op? {
        val mine = ops.filter { it.user == user }
        val first = mine.firstOrNull() ?: return null
        return if (first.failed) null else first
    }

    /**
     * After a successful upload the server reports which records changed (with their new change
     * times). Later queued edits of those records were made on top of this upload, so they move
     * their base forward instead of being reported as conflicts with ourselves. ISO-8601 times
     * from the server compare correctly as text.
     */
    fun rebase(ops: List<Op>, touched: Map<String, String>): List<Op> = ops.map { op ->
        val at = touched[op.recordId]
        if (at == null || op.base == null || op.base >= at) op else op.copy(base = at)
    }

    /** Adding a change twice (a double tap, a retried bridge call) keeps one copy. */
    fun add(ops: List<Op>, op: Op): List<Op> = if (ops.any { it.opId == op.opId }) ops else ops + op
}
