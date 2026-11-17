import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRefundSnapshot, type RefundSnapshot } from "../lib/career/refund-preflight";

const orderId = "T" + "a".repeat(30);
const pristine: RefundSnapshot = {
  provider: "ALIPAY", status: "PAID", amountFen: 990, credits: 20,
  providerTradeId: "ALIPAY:merchant-payment-123", refundHold: true,
  grant: { total: 20, remaining: 20, runs: [] },
  refundCases: [{ status: "OPEN" }],
};

test("pristine fully frozen credit pack can reach manual review but NEVER authorize money", () => {
  const before = structuredClone(pristine);
  const result = assessRefundSnapshot(orderId, pristine);
  assert.equal(result.review, "READY_FOR_MANUAL_REVIEW");
  assert.deepEqual(result.issues, []);
  assert.equal(result.automaticallyRefundable, false);
  assert.equal(result.remainingCredits, 20);
  assert.deepEqual(pristine, before, "refund assessment must be side-effect-free");
});

test("in-flight calls, consumed credits and restored failed calls are accounted separately", () => {
  const withInFlight: RefundSnapshot = {
    ...pristine, grant: { total: 20, remaining: 18,
      runs: [{ status: "RESERVED" }, { status: "SUCCEEDED" }, { status: "FAILED" }] },
  };
  const result = assessRefundSnapshot(orderId, withInFlight);
  assert.equal(result.reservedRuns, 1);
  assert.equal(result.succeededRuns, 1);
  assert.equal(result.failedRuns, 1);
  assert.ok(result.issues.includes("IN_FLIGHT"));
  assert.ok(result.issues.includes("CONSUMED_CREDITS"));
  assert.equal(result.issues.includes("LEDGER_MISMATCH"), false);
  assert.equal(result.automaticallyRefundable, false);
  const failedRestored: RefundSnapshot = {
    ...pristine, grant: { total: 20, remaining: 20, runs: [{ status: "FAILED" }] },
  };
  assert.equal(assessRefundSnapshot(orderId, failedRestored).review, "READY_FOR_MANUAL_REVIEW");
});

test("missing hold, no open refund and historical processing prevent normal review", () => {
  const result = assessRefundSnapshot(orderId, {
    ...pristine, refundHold: false,
    refundCases: [{ status: "REJECTED" }, { status: "PROCESSING" }],
  });
  assert.ok(result.issues.includes("NOT_FROZEN"));
  assert.ok(result.issues.includes("NO_OPEN_REQUEST"));
  assert.ok(result.issues.includes("PREVIOUS_REFUND_UNRESOLVED"));
  assert.equal(result.review, "NEEDS_RECONCILIATION");
  assert.equal(result.automaticallyRefundable, false);
});

test("mock payment, mismatched ledger, malformed references and invalid money are rejected", () => {
  const result = assessRefundSnapshot(orderId, {
    ...pristine, provider: "MOCK", amountFen: 0,
    providerTradeId: null,
    grant: { total: 20, remaining: 20, runs: [{ status: "SUCCEEDED" }] },
  });
  for (const issue of ["MOCK_PAYMENT", "INVALID_ORDER_AMOUNT",
    "MISSING_PAYMENT_REFERENCE", "LEDGER_MISMATCH", "CONSUMED_CREDITS"]) {
    assert.ok(result.issues.includes(issue as typeof result.issues[number]), issue);
  }
  assert.equal(result.automaticallyRefundable, false);
  assert.throws(() => assessRefundSnapshot("not-an-order", pristine), /Invalid refund order/);
});
