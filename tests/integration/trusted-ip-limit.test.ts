import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../lib/db";
import { allowAttempt } from "../../lib/rate-limit";

test("shared trusted-IP limiter atomically caps concurrent attempts across identities", async () => {
  if (process.env.INTEGRATION_TEST_DATABASE !== "true") throw new Error("Disposable database required");
  // Distinct account identities do not bypass the common IP quota.
  const scope = "test-login-trusted-ip-" + randomUUID();
  const ip = "203.0.113.44", windowMinutes = 15;
  const windowMs = windowMinutes * 60000;
  const start = Math.floor(Date.now() / windowMs);
  const keys = [start - 1, start, start + 1].map(window =>
    createHash("sha256").update(scope + ":" + ip + ":" + window).digest("hex")
  );
  try {
    const results = await Promise.all(
      Array.from({ length: 7 }, () => allowAttempt(scope, ip, 3, windowMinutes))
    );
    assert.equal(results.filter(Boolean).length, 3, "exactly three attempts may pass even concurrently");
    assert.equal(await allowAttempt(scope, ip, 3, windowMinutes), false);
  } finally {
    await db.authAttempt.deleteMany({ where: { key: { in: keys } } });
    await db.$disconnect();
  }
});
