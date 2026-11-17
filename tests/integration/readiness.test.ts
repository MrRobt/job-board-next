import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { db } from "../../lib/db";
import { GET } from "../../app/api/readyz/route";

test("database readiness requires a separate probe credential and returns only a health code", async () => {
  if (process.env.INTEGRATION_TEST_DATABASE !== "true") {
    throw new Error("Disposable MySQL required");
  }
  const saved = process.env.READINESS_PROBE_TOKEN;
  const token = randomBytes(36).toString("hex");
  const baseUrl = "http://localhost/api/readyz";
  try {
    delete process.env.READINESS_PROBE_TOKEN;
    const disabled = await GET(new Request(baseUrl));
    assert.equal(disabled.status, 404);
    process.env.READINESS_PROBE_TOKEN = token;
    const unauthorized = await GET(new Request(baseUrl));
    assert.equal(unauthorized.status, 404);
    const valid = await GET(new Request(baseUrl, {
      headers: { "x-readiness-token": token },
    }));
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get("cache-control"), "no-store");
    assert.deepEqual(await valid.json(), { status: "ok" });
  } finally {
    if (saved === undefined) delete process.env.READINESS_PROBE_TOKEN;
    else process.env.READINESS_PROBE_TOKEN = saved;
    await db.$disconnect();
  }
});
