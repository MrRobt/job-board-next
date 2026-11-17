import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db";
import { pruneExpiredAuthRecords } from "../../lib/auth-retention";

test("retention preview is read-only and validates the bounded batch", async () => {
  if (process.env.INTEGRATION_TEST_DATABASE !== "true") {
    throw new Error("Disposable database required");
  }
  try {
    const [sessionsBefore, attemptsBefore] = await Promise.all([
      db.session.count(), db.authAttempt.count(),
    ]);
    const preview = await pruneExpiredAuthRecords({
      now: new Date("2000-01-01T00:00:00.000Z"), batchSize: 1,
    });
    assert.equal(preview.mode, "DRY_RUN");
    assert.equal(preview.deletedSessions, 0);
    assert.equal(preview.deletedAttempts, 0);
    const [sessionsAfter, attemptsAfter] = await Promise.all([
      db.session.count(), db.authAttempt.count(),
    ]);
    assert.equal(sessionsAfter, sessionsBefore);
    assert.equal(attemptsAfter, attemptsBefore);
    await assert.rejects(pruneExpiredAuthRecords({ batchSize: 0 }), /batch size/);
    await assert.rejects(pruneExpiredAuthRecords({ batchSize: 1001 }), /batch size/);
    await assert.rejects(pruneExpiredAuthRecords({ now: new Date(Number.NaN) }), /maintenance time/);
  } finally {
    await db.$disconnect();
  }
});
