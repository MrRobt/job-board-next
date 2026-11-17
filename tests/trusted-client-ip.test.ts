import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedClientIp } from "../lib/trusted-client-ip";

test("no explicit trusted proxy: never trust client-supplied forwarding headers", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.8",
    "x-real-ip": "203.0.113.8",
    "cf-connecting-ip": "203.0.113.9",
  });
  assert.equal(trustedClientIp(headers), null);
  assert.equal(trustedClientIp(headers, "x-forwarded-for"), null);
  assert.equal(trustedClientIp(headers, "forwarded"), null);
});

test("configured proxy IP is single and canonical; spoofed lists or ports rejected", () => {
  assert.equal(trustedClientIp(new Headers({ "x-real-ip": "203.0.113.8" }), "x-real-ip"), "203.0.113.8");
  assert.equal(trustedClientIp(new Headers({ "cf-connecting-ip": "2001:0DB8:0:0:0:0:0:8" }), "cf-connecting-ip"), "2001:db8::8");
  assert.equal(trustedClientIp(new Headers({ "x-real-ip": "203.0.113.8, 198.51.100.2" }), "x-real-ip"), null);
  assert.equal(trustedClientIp(new Headers({ "x-real-ip": "203.0.113.8:443" }), "x-real-ip"), null);
  assert.equal(trustedClientIp(new Headers({ "x-real-ip": "unknown" }), "x-real-ip"), null);
  assert.equal(trustedClientIp(new Headers({ "x-real-ip": "fe80::1%eth0" }), "x-real-ip"), null);
  assert.equal(trustedClientIp(new Headers({ "x-real-ip": "203.0.113.8" }), "cf-connecting-ip"), null);
});
