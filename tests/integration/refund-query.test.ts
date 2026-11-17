import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { canonical, sign, verify } from "../../lib/payment/crypto";
import {
  liveRefundInquiryGateway, refundInquiryEnabled, validateRefundInquiry,
  type RefundInquiry,
} from "../../lib/payment/refund-query";

const orderId = "T" + "a".repeat(30);
const inquiry: RefundInquiry = {
  orderId, outRefundNo: "R" + "b".repeat(29),
  providerTradeId: "merchant-trade-123", originalAmountFen: 990, refundAmountFen: 990,
};
function keys() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}
function envFor(values: Record<string, string>) {
  const previous = new Map(Object.keys(values).map(k => [k, process.env[k]]));
  Object.entries(values).forEach(([k, v]) => { process.env[k] = v; });
  return () => {
    for (const [k, v] of previous)
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
  };
}

test("refund inquiry is read-only, guarded, and rejects invalid identifiers/amounts", async () => {
  assert.throws(() => validateRefundInquiry({ ...inquiry, outRefundNo: "../bad" }));
  assert.throws(() => validateRefundInquiry({ ...inquiry, refundAmountFen: 991 }));
  assert.throws(() => validateRefundInquiry({ ...inquiry, originalAmountFen: Number.NaN }));
  const reset = envFor({ ENABLE_REAL_PAYMENT: "false", ENABLE_REFUND_QUERY: "true" });
  const existingFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new Error("Unexpected network call"); }) as typeof fetch;
    assert.equal(refundInquiryEnabled("WECHAT"), false);
    await assert.rejects(liveRefundInquiryGateway.query("WECHAT", inquiry), /disabled/);
    await assert.rejects(liveRefundInquiryGateway.query("WECHAT", { ...inquiry, outRefundNo: "/" }), /Invalid refund id/);
  } finally { globalThis.fetch = existingFetch; reset(); }
});

test("WeChat refund query checks response signature, order, request, transaction, and exact money", async () => {
  const merchant = keys(), platform = keys();
  const reset = envFor({
    ENABLE_REAL_PAYMENT: "true", ENABLE_REFUND_QUERY: "true",
    WECHAT_MCH_ID: "mch-local", WECHAT_MERCHANT_SERIAL: "serial-local",
    WECHAT_PRIVATE_KEY: merchant.privateKey,
    WECHAT_PAY_PUBLIC_KEY_ID: "PUB_KEY_ID_LOCAL",
    WECHAT_PAY_PUBLIC_KEY: platform.publicKey,
  });
  const existingFetch = globalThis.fetch;
  let state = "SUCCESS", malformed = false, changeAmount = false, wrongOrder = false;
  let wrongSignature = false, wrongTrade = false, wrongRefund = false;
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, "https://api.mch.weixin.qq.com/v3/refund/domestic/refunds/" + inquiry.outRefundNo);
      assert.equal(init?.method, "GET");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers["Wechatpay-Serial"], "PUB_KEY_ID_LOCAL");
      assert.match(headers.Authorization, /WECHATPAY2-SHA256-RSA2048/);
      const components = Object.fromEntries([...headers.Authorization.matchAll(/([a-z_]+)="([^"]+)"/g)]
        .map(match => [match[1], match[2]]));
      assert.equal(verify("GET\n/v3/refund/domestic/refunds/" + inquiry.outRefundNo + "\n" +
        components.timestamp + "\n" + components.nonce_str + "\n\n",
        components.signature, merchant.publicKey), true);
      const raw = JSON.stringify({
        out_trade_no: wrongOrder ? "T" + "c".repeat(30) : orderId,
        out_refund_no: wrongRefund ? "R" + "z".repeat(29) : inquiry.outRefundNo,
        transaction_id: wrongTrade ? "unexpected-trade" : inquiry.providerTradeId,
        status: state,
        amount: { total: 990, refund: changeAmount ? 100 : 990, currency: "CNY" },
        ...(malformed ? { other: "irrelevant" } : {}),
      });
      const timestamp = Math.floor(Date.now() / 1000).toString(), nonce = "refund-nonce";
      return new Response(raw, { status: 200, headers: {
        "wechatpay-timestamp": timestamp, "wechatpay-nonce": nonce,
        "wechatpay-serial": "PUB_KEY_ID_LOCAL",
        "wechatpay-signature": wrongSignature ? "forged" :
          sign(timestamp + "\n" + nonce + "\n" + raw + "\n", platform.privateKey),
      } });
    }) as typeof fetch;
    assert.equal((await liveRefundInquiryGateway.query("WECHAT", inquiry)).state, "SUCCEEDED");
    state = "PROCESSING";
    assert.equal((await liveRefundInquiryGateway.query("WECHAT", inquiry)).state, "PROCESSING");
    state = "ABNORMAL";
    assert.equal((await liveRefundInquiryGateway.query("WECHAT", inquiry)).state, "UNKNOWN");
    state = "CLOSED";
    assert.equal((await liveRefundInquiryGateway.query("WECHAT", inquiry)).state, "FAILED");
    wrongOrder = true;
    await assert.rejects(liveRefundInquiryGateway.query("WECHAT", inquiry), /order mismatch/);
    wrongOrder = false; wrongRefund = true;
    await assert.rejects(liveRefundInquiryGateway.query("WECHAT", inquiry), /request mismatch/);
    wrongRefund = false; wrongTrade = true;
    await assert.rejects(liveRefundInquiryGateway.query("WECHAT", inquiry), /transaction mismatch/);
    wrongTrade = false; changeAmount = true;
    await assert.rejects(liveRefundInquiryGateway.query("WECHAT", inquiry), /money mismatch/);
    changeAmount = false; wrongSignature = true;
    await assert.rejects(liveRefundInquiryGateway.query("WECHAT", inquiry), /Unverified/);
  } finally { globalThis.fetch = existingFetch; reset(); }
});

test("Alipay refund query verifies exact signed JSON and does not infer success from code=10000", async () => {
  const merchant = keys(), platform = keys();
  const reset = envFor({
    ENABLE_REAL_PAYMENT: "true", ENABLE_REFUND_QUERY: "true",
    ALIPAY_APP_ID: "app-local", ALIPAY_SELLER_ID: "seller-local",
    ALIPAY_PRIVATE_KEY: merchant.privateKey, ALIPAY_PUBLIC_KEY: platform.publicKey,
    ALIPAY_GATEWAY: "https://openapi.alipay.com/gateway.do",
  });
  const existingFetch = globalThis.fetch;
  let refundStatus: string | undefined = "REFUND_SUCCESS";
  let wrongAmount = false, wrongSeller = false, wrongTrade = false, forged = false;
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, "https://openapi.alipay.com/gateway.do");
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("method"), "alipay.trade.fastpay.refund.query");
      const req = Object.fromEntries(form);
      const reqSign = req.sign;
      delete req.sign;
      assert.ok(reqSign && verify(canonical(req), reqSign, merchant.publicKey));
      const biz = JSON.parse(req.biz_content);
      assert.equal(biz.out_trade_no, orderId);
      assert.equal(biz.out_request_no, inquiry.outRefundNo);
      const obj = JSON.stringify({
        code: "10000", msg: "Success", out_trade_no: orderId,
        out_request_no: inquiry.outRefundNo,
        trade_no: wrongTrade ? "not-the-original-transaction" : inquiry.providerTradeId,
        seller_id: wrongSeller ? "other-merchant" : "seller-local",
        total_amount: "9.90", refund_amount: wrongAmount ? "0.01" : "9.90",
        ...(refundStatus === undefined ? {} : { refund_status: refundStatus }),
      });
      return new Response(JSON.stringify({
        alipay_trade_fastpay_refund_query_response: JSON.parse(obj),
        sign: forged ? "bad-signature" : sign(obj, platform.privateKey),
      }), { status: 200 });
    }) as typeof fetch;
    assert.equal((await liveRefundInquiryGateway.query("ALIPAY", inquiry)).state, "SUCCEEDED");
    refundStatus = undefined;
    assert.equal((await liveRefundInquiryGateway.query("ALIPAY", inquiry)).state, "UNKNOWN");
    refundStatus = "REFUND_PROCESSING";
    assert.equal((await liveRefundInquiryGateway.query("ALIPAY", inquiry)).state, "UNKNOWN");
    wrongAmount = true;
    await assert.rejects(liveRefundInquiryGateway.query("ALIPAY", inquiry), /money mismatch/);
    wrongAmount = false; wrongSeller = true;
    await assert.rejects(liveRefundInquiryGateway.query("ALIPAY", inquiry), /seller mismatch/);
    wrongSeller = false; wrongTrade = true;
    await assert.rejects(liveRefundInquiryGateway.query("ALIPAY", inquiry), /transaction mismatch/);
    wrongTrade = false; forged = true;
    await assert.rejects(liveRefundInquiryGateway.query("ALIPAY", inquiry), /Unverified/);
  } finally { globalThis.fetch = existingFetch; reset(); }
});
