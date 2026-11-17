import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareMerchantRefund, wechatRefundPayload, alipayRefundPayload,
  type MerchantRefundIntent,
} from "../lib/payment/refund-request-payload";

const orderId = "T" + "b".repeat(30);
const base: MerchantRefundIntent = {
  caseId: "refundcase_20261118_A1", orderId,
  provider: "WECHAT", providerTradeId: "WECHAT:trade_123",
  originalAmountFen: 990, refundAmountFen: 990,
  reason: "用户申请退款，需要人工核实",
};
test("merchant refund ID and payload remain stable across process retries", () => {
  const first = prepareMerchantRefund(base);
  const next = prepareMerchantRefund({ ...base });
  assert.deepEqual(first, next);
  assert.match(first.outRefundNo, /^R[a-f0-9]{30}$/);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(wechatRefundPayload(base, first.fingerprint), {
    out_trade_no: orderId,
    out_refund_no: first.outRefundNo,
    reason: base.reason,
    amount: { refund: 990, total: 990, currency: "CNY" },
  });
});

test("changing refund amount, provider, reason or payment reference on retry is rejected", () => {
  const recorded = prepareMerchantRefund(base);
  for (const edited of [
    { ...base, refundAmountFen: 1 },
    { ...base, reason: "另一种退款原因" },
    { ...base, providerTradeId: "WECHAT:trade_456" },
    { ...base, provider: "ALIPAY" as const, providerTradeId: "ALIPAY:trade_123" },
  ]) {
    assert.throws(() => prepareMerchantRefund(edited, recorded.fingerprint), /differs/);
  }
  assert.equal(prepareMerchantRefund({ ...base, refundAmountFen: 1 }).outRefundNo,
    recorded.outRefundNo, "same persisted case never creates a second merchant refund ID");
});

test("Alipay refund request is in exact yuan and uses the same deterministic request ID", () => {
  const intent: MerchantRefundIntent = {
    ...base, provider: "ALIPAY", providerTradeId: "ALIPAY:trade_123",
    refundAmountFen: 301, reason: "三元零一分退款",
  };
  const prepared = prepareMerchantRefund(intent);
  assert.deepEqual(alipayRefundPayload(intent, prepared.fingerprint), {
    out_trade_no: orderId,
    out_request_no: prepared.outRefundNo,
    refund_amount: "3.01",
    refund_reason: intent.reason,
  });
  assert.throws(() => wechatRefundPayload(intent), /Expected WeChat/);
  assert.throws(() => alipayRefundPayload(base), /Expected Alipay/);
});

test("refund command rejects invalid identifiers, mock, floating sums, excessive amounts and unsafe reasons", () => {
  const invalid: MerchantRefundIntent[] = [
    { ...base, caseId: "x" },
    { ...base, orderId: "bad" },
    { ...base, provider: "MOCK" as "WECHAT" },
    { ...base, providerTradeId: "ALIPAY:trade_123" },
    { ...base, originalAmountFen: 0 },
    { ...base, refundAmountFen: -1 },
    { ...base, refundAmountFen: 991 },
    { ...base, refundAmountFen: 0.1 },
    { ...base, originalAmountFen: Number.NaN },
    { ...base, reason: "x".repeat(81) },
    { ...base, reason: "\r\nX-Forwarded-For: fake" },
  ];
  for (const intent of invalid) {
    assert.throws(() => prepareMerchantRefund(intent), { name: "Error" }, JSON.stringify(intent));
  }
});
