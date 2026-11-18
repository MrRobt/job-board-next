import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareRecordedRefundInquiry,
  queryRecordedRefund,
  type RecordedRefundInquirySnapshot,
} from "../lib/payment/refund-inquiry-bridge";
import { prepareMerchantRefund, type MerchantRefundIntent } from "../lib/payment/refund-request-payload";
import type { RefundInquiryGateway } from "../lib/payment/refund-query";

const originalOrder = "T" + "a".repeat(30);
const base: MerchantRefundIntent = {
  caseId: "refundcase_20261118_C3",
  orderId: originalOrder,
  provider: "WECHAT",
  providerTradeId: "WECHAT:420000000000001",
  originalAmountFen: 990,
  refundAmountFen: 990,
  reason: "After purchase, request manual service refund review",
};
function snapshot(intent: MerchantRefundIntent = base): RecordedRefundInquirySnapshot {
  const prepared = prepareMerchantRefund(intent);
  return {
    intent, recordedOutRefundNo: prepared.outRefundNo,
    recordedFingerprint: prepared.fingerprint,
    caseStatus: "PROCESSING", orderStatus: "PAID",
    refundHold: true, dispatchRecorded: true,
  };
}

test("merchant inquiry uses raw provider transaction ID but retains the stable persisted refund ID", () => {
  const record = snapshot();
  assert.deepEqual(prepareRecordedRefundInquiry(record), {
    orderId: originalOrder,
    outRefundNo: record.recordedOutRefundNo,
    providerTradeId: "420000000000001",
    originalAmountFen: 990,
    refundAmountFen: 990,
  });
  const alipayIntent: MerchantRefundIntent = {
    ...base, provider: "ALIPAY", providerTradeId: "ALIPAY:202611180001",
  };
  assert.equal(prepareRecordedRefundInquiry(snapshot(alipayIntent)).providerTradeId, "202611180001");
});

test("a recorded, dispatched processing case returns read-only trusted gateway observations", async () => {
  const record = snapshot();
  let calls = 0;
  const gateway: RefundInquiryGateway = {
    async query(provider, inquiry) {
      calls++;
      assert.equal(provider, "WECHAT");
      assert.equal(inquiry.providerTradeId, "420000000000001");
      return {
        provider, orderId: inquiry.orderId,
        outRefundNo: inquiry.outRefundNo,
        refundAmountFen: inquiry.refundAmountFen,
        state: "SUCCEEDED",
      };
    },
  };
  const observed = await queryRecordedRefund(record, gateway);
  assert.equal(observed.state, "SUCCEEDED");
  assert.equal(calls, 1);
  // This read-only method returns provider evidence, not a paid/revoked DB state.
  assert.equal("automaticallyRefundable" in observed, false);
});

test("no merchant inquiry before durable dispatch and account/hold state checks", async () => {
  const initial = snapshot();
  let invoked = false;
  const gateway: RefundInquiryGateway = {
    async query() {
      invoked = true;
      throw new Error("must not call");
    },
  };
  const changes: RecordedRefundInquirySnapshot[] = [
    { ...initial, caseStatus: "OPEN" },
    { ...initial, caseStatus: "REJECTED" },
    { ...initial, caseStatus: "FAILED" },
    { ...initial, dispatchRecorded: false },
    { ...initial, orderStatus: "PENDING" },
    { ...initial, orderStatus: "REFUNDED" },
    { ...initial, refundHold: false },
    { ...initial, recordedOutRefundNo: "R" + "0".repeat(30) },
    { ...initial, recordedFingerprint: "f".repeat(64) },
    { ...initial, intent: { ...initial.intent, refundAmountFen: 1 } },
    { ...initial, intent: { ...initial.intent, providerTradeId: "WECHAT:420000000000002" } },
    { ...initial, intent: { ...initial.intent, providerTradeId: "ALIPAY:420000000000001" } },
    { ...initial, intent: { ...initial.intent, providerTradeId: "WECHAT:bad:colon" } },
  ];
  for (const candidate of changes) {
    await assert.rejects(queryRecordedRefund(candidate, gateway), { name: "Error" });
  }
  assert.equal(invoked, false, "invalid persisted context must fail before gateway call");
});

test("mismatched or malformed gateway observations cannot become verified refund evidence", async () => {
  const record = snapshot();
  const sample = {
    provider: record.intent.provider,
    orderId: record.intent.orderId,
    outRefundNo: record.recordedOutRefundNo,
    refundAmountFen: record.intent.refundAmountFen,
    state: "SUCCEEDED" as const,
  };
  for (const bad of [
    { ...sample, provider: "ALIPAY" as const },
    { ...sample, orderId: "T" + "f".repeat(30) },
    { ...sample, outRefundNo: "R" + "b".repeat(30) },
    { ...sample, refundAmountFen: 100 },
    { ...sample, state: "REFUNDED" as "SUCCEEDED" },
  ]) {
    await assert.rejects(queryRecordedRefund(record, {
      async query() { return bad; },
    }));
  }
});
