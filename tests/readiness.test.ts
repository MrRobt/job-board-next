import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readinessAuthorized, checkReadiness } from "../lib/readiness";

test("readiness gate fails closed for missing, short, and incorrect credentials", () => {
  const token = randomBytes(36).toString("hex");
  assert.equal(readinessAuthorized(undefined, token), false);
  assert.equal(readinessAuthorized(token, null), false);
  assert.equal(readinessAuthorized("short", "short"), false);
  assert.equal(readinessAuthorized(token, token + "different"), false);
  assert.equal(readinessAuthorized(token, token), true);
});

test("readiness probe reports status without leaking errors", async () => {
  let runs = 0;
  assert.equal(await checkReadiness(async () => { runs++; }), "ok");
  assert.equal(await checkReadiness(async () => {
    runs++;
    throw new Error("internal database detail must not be returned");
  }), "unavailable");
  assert.equal(runs, 2);
});
