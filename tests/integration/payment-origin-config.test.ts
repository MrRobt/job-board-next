import { test } from "node:test";
import assert from "node:assert/strict";
import { enabled, origin } from "../../lib/payment/config";

test("payment enablement uses the exact same strict callback-origin policy", () => {
  const names = [
    "ENABLE_REAL_PAYMENT", "APP_ORIGIN",
    "ALIPAY_APP_ID", "ALIPAY_SELLER_ID",
    "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY",
  ];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    // No real credentials or HTTP invocation: only the gate is evaluated.
    process.env.ENABLE_REAL_PAYMENT = "true";
    for (const key of names.slice(2)) process.env[key] = "configured-placeholder";
    process.env.APP_ORIGIN = "https://merchant.company.cn";
    assert.equal(enabled("ALIPAY"), true);
    assert.equal(origin(), "https://merchant.company.cn");

    const invalid = [
      "https://127.0.0.1", "https://localhost",
      "https://merchant.company.cn/app",
      "https://merchant.company.cn:8443",
      "https://user@merchant.company.cn",
      "https://merchant.company.cn/?debug=1",
      "https://merchant.company.cn.evil.internal",
      "http://merchant.company.cn",
    ];
    for (const value of invalid) {
      process.env.APP_ORIGIN = value;
      assert.equal(enabled("ALIPAY"), false, value);
      assert.throws(() => origin(), /Invalid payment callback origin/, value);
    }
    process.env.APP_ORIGIN = "https://merchant.company.cn";
    process.env.ENABLE_REAL_PAYMENT = "false";
    assert.equal(enabled("ALIPAY"), false, "default production gate must still be off");
    process.env.ENABLE_REAL_PAYMENT = "true";
    delete process.env.ALIPAY_PUBLIC_KEY;
    assert.equal(enabled("ALIPAY"), false, "missing merchant material must fail closed");
  } finally {
    for (const name of names) {
      const previous = saved[name];
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  }
});
