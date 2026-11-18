import { test } from "node:test";
import assert from "node:assert/strict";
import { validatedPaymentOrigin } from "../lib/payment/origin-policy";

test("payment callback origin accepts only a canonical, public HTTPS origin", () => {
  assert.equal(validatedPaymentOrigin("https://payments.example.cn"), "https://payments.example.cn");
  assert.equal(validatedPaymentOrigin("https://payments.example.cn/"), "https://payments.example.cn");
  assert.equal(validatedPaymentOrigin("https://pay.demo-company.com"), "https://pay.demo-company.com");
});
test("payment callback origin rejects local/IP/credentials/port/path/query/ambiguity", () => {
  const invalid = [
    undefined, "", "http://payments.example.cn", "https://localhost",
    "https://my-host.internal", "https://my-host.local",
    "https://app.example.test", "https://127.0.0.1",
    "https://10.5.0.1", "https://169.254.169.254",
    "https://[::1]", "https://[::ffff:127.0.0.1]",
    "https://payments.example.cn:8443", "https://user@payments.example.cn",
    "https://payments.example.cn/login", "https://payments.example.cn/?redirect=/ok",
    "https://payments.example.cn/#x", "https://payments.example.cn//",
    "https://payments.example.cn./", "https://payments.example.cn\\@evil.test",
    "https://payments.example.cn ", "https://pay.example.cn.evil.internal",
    "https://company", "https://-bad.example.cn", "https://bad-.example.cn",
    "https://a..example.cn", "https://payments.example.cn:443",
  ];
  for (const origin of invalid) {
    assert.throws(() => validatedPaymentOrigin(origin), /Invalid payment callback origin/, String(origin));
  }
});
