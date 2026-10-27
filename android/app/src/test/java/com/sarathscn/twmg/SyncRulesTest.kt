package com.sarathscn.twmg

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SyncRulesTest {
    private fun op(id: String, record: String, base: String? = "2026-10-27T10:00:00.000000+00:00", user: String = "u1", failed: Boolean = false) =
        SyncRules.Op(id, user, record, base, failed)

    @Test fun serverResponsesMapToSafeOutcomes() {
        assertEquals(SyncRules.Outcome.DONE, SyncRules.classify(200))
        assertEquals(SyncRules.Outcome.NEEDS_SIGN_IN, SyncRules.classify(401))
        assertEquals(SyncRules.Outcome.NEEDS_SIGN_IN, SyncRules.classify(403))
        assertEquals(SyncRules.Outcome.CONFLICT, SyncRules.classify(409))
        assertEquals(SyncRules.Outcome.REJECTED, SyncRules.classify(400))
        assertEquals(SyncRules.Outcome.REJECTED, SyncRules.classify(404))
        // No connection (0), timeouts and server errors are retried later, never dropped.
        for (code in listOf(0, 408, 429, 500, 502, 503)) assertEquals("HTTP $code", SyncRules.Outcome.RETRY_LATER, SyncRules.classify(code))
    }

    @Test fun uploadsGoInOrderAndStopAtAFailedChange() {
        val ops = listOf(op("a", "acc1"), op("b", "tx1"))
        assertEquals("a", SyncRules.next(ops, "u1")?.opId)
        // A refused first change blocks the rest, so a transaction never lands before its account.
        assertNull(SyncRules.next(listOf(op("a", "acc1", failed = true), op("b", "tx1")), "u1"))
        assertNull(SyncRules.next(emptyList(), "u1"))
    }

    @Test fun onlyTheSignedInAccountsChangesAreUploaded() {
        val ops = listOf(op("x", "r1", user = "someone-else"), op("a", "r2"))
        assertEquals("a", SyncRules.next(ops, "u1")?.opId)
        assertNull(SyncRules.next(listOf(op("x", "r1", user = "someone-else")), "u1"))
    }

    @Test fun laterEditsOfAnUploadedRecordMoveTheirBaseForward() {
        val later = "2026-10-27T10:05:00.000000+00:00"
        val ops = listOf(op("b", "tx1"), op("c", "tx2"), op("d", "tx1", base = null))
        val rebased = SyncRules.rebase(ops, mapOf("tx1" to later))
        assertEquals(later, rebased[0].base)
        assertEquals("unrelated records keep their base", ops[1].base, rebased[1].base)
        assertNull("a change sent without a base stays without one", rebased[2].base)
        // Never moves a base backwards.
        assertEquals(later, SyncRules.rebase(rebased, mapOf("tx1" to "2026-10-27T09:00:00.000000+00:00"))[0].base)
    }

    @Test fun theSameChangeIsQueuedOnce() {
        val ops = SyncRules.add(SyncRules.add(emptyList(), op("a", "r1")), op("a", "r1"))
        assertEquals(1, ops.size)
    }
}
