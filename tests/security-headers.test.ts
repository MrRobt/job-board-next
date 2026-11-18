import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../next.config";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

test("global HTTP headers harden browser behavior without blocking payment navigation", async () => {
  const rules = (await config.headers?.()) as HeaderRule[] | undefined;
  assert.ok(rules);
  const globals = rules.find(rule => rule.source === "/:path*");
  assert.ok(globals);
  const entries = Object.fromEntries(globals.headers.map(h => [h.key.toLowerCase(), h.value]));
  assert.equal(entries["x-content-type-options"], "nosniff");
  assert.equal(entries["x-frame-options"], "DENY");
  assert.equal(entries["referrer-policy"], "no-referrer");
  assert.match(entries["permissions-policy"], /camera=\(\)/);
  assert.match(entries["strict-transport-security"], /^max-age=\d+$/);
  assert.ok(!entries["content-security-policy"], "CSP needs nonce-aware deployment verification");
  assert.ok(!entries["cache-control"], "do not disable caching of static assets globally");
});

test("private account, admin, AI and payment paths disable shared HTTP caching", async () => {
  const rules = (await config.headers?.()) as HeaderRule[] | undefined;
  assert.ok(rules);
  const protectedPaths = [
    "/account/:path*", "/admin/:path*", "/tracker/:path*",
    "/report/:path*", "/api/:path*", "/tools/:path*",
    "/pay/:path*", "/tool-pay/:path*", "/checkout/:path*",
    "/login", "/register",
  ];
  for (const path of protectedPaths) {
    const rule: HeaderRule | undefined = rules.find((item: HeaderRule) => item.source === path);
    assert.ok(rule, "No private cache protection for " + path);
    const control: { key: string; value: string } | undefined = rule.headers.find((h: { key: string; value: string }) => h.key.toLowerCase() === "cache-control");
    assert.equal(control?.value, "private, no-store, max-age=0");
  }
});
