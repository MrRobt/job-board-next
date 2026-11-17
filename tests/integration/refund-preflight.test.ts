import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../lib/db";
import { reserveToolOrder, settleToolPayment } from "../../lib/career/billing";
import { requestToolRefund, rejectToolRefund } from "../../lib/career/refund-cases";
import { reserve, finish } from "../../lib/career/credits";
import { assessRefundSnapshot, readToolRefundPreflight } from "../../lib/career/refund-preflight";

test("refund preflight is private, read-only and catches in-flight/consumed credits", async () => {
  if (process.env.INTEGRATION_TEST_DATABASE !== "true") throw new Error("Disposable MySQL required");
  const tag = randomUUID();
  const user = await db.user.create({ data: { email: tag + "@example.invalid", passwordHash: "test-only" } });
  const outsider = await db.user.create({ data: { email: tag + "-other@example.invalid", passwordHash: "test-only" } });
  const admin = await db.user.create({ data: { email: tag + "-admin@example.invalid", passwordHash: "test-only", role: "ADMIN" } });
  try {
    // Consume the trial before purchasing a pack; grants are spent oldest-first.
    const trial = await reserve(user.id, "trial-" + tag, "resume");
    assert.equal(trial.state, "reserved");
    if (trial.state === "reserved") await finish(trial.id, true);
    const order = await reserveToolOrder(user.id, "STARTER20", "ALIPAY");
    await settleToolPayment({ provider: "ALIPAY", orderId: order.id, tradeId: tag, amountFen: 990 });
    await assert.rejects(readToolRefundPreflight(outsider.id, order.id), /Not authorized/);
    await assert.rejects(readToolRefundPreflight(user.id, "bad"), /Invalid order/);
    let info = await readToolRefundPreflight(user.id, order.id);
    assert.equal(info.review, "NEEDS_RECONCILIATION");
    assert.ok(info.issues.includes("NO_OPEN_REQUEST"));
    assert.ok(info.issues.includes("NOT_FROZEN"));
    assert.equal(info.automaticallyRefundable, false);

    // The trial was spent before purchase; this run is against the paid grant.
    const paid = await reserve(user.id, "paid-" + tag, "questions");
    assert.equal(paid.state, "reserved");
    const request = await requestToolRefund(
      user.id, order.id, "申请退款，暂时无法使用服务，希望客服帮助确认退还资格。"
    );
    info = await readToolRefundPreflight(admin.id, order.id);
    assert.equal(info.requestStatus, "OPEN");
    assert.equal(info.refundHold, true);
    assert.equal(info.reservedRuns, 1);
    assert.ok(info.issues.includes("IN_FLIGHT"));
    assert.equal(info.review, "NEEDS_RECONCILIATION");
    assert.equal(info.automaticallyRefundable, false);
    const before = await db.toolOrder.findUniqueOrThrow({ where: { id: order.id } });
    const grantBefore = await db.toolGrant.findUniqueOrThrow({ where: { orderId: order.id } });
    await readToolRefundPreflight(user.id, order.id);
    assert.deepEqual(await db.toolOrder.findUniqueOrThrow({ where: { id: order.id } }), before);
    assert.deepEqual(await db.toolGrant.findUniqueOrThrow({ where: { orderId: order.id } }), grantBefore);

    if (paid.state === "reserved") await finish(paid.id, false);
    info = await readToolRefundPreflight(user.id, order.id);
    assert.equal(info.reservedRuns, 0);
    assert.equal(info.remainingCredits, 20);
    assert.deepEqual(info.issues, []);
    assert.equal(info.review, "READY_FOR_MANUAL_REVIEW");
    assert.equal(info.automaticallyRefundable, false);

    await rejectToolRefund(admin.id, request.id, "经过客服检查需要补充退款资料，以便按照适用政策审查。");
    const successful = await reserve(user.id, "paid-success-" + tag, "resume");
    assert.equal(successful.state, "reserved");
    if (successful.state === "reserved") await finish(successful.id, true);
    await requestToolRefund(user.id, order.id, "本次使用了部分次数后要求退款，请客服核实已经使用的服务。");
    info = await readToolRefundPreflight(admin.id, order.id);
    assert.equal(info.succeededRuns, 1);
    assert.ok(info.issues.includes("CONSUMED_CREDITS"));
    assert.equal(info.review, "NEEDS_RECONCILIATION");
    assert.equal(info.orderStatus, "PAID", "preflight does not change financial status");
  } finally {
    const ids = [user.id, outsider.id, admin.id];
    await db.toolRefundCase.deleteMany({ where: { userId: user.id } });
    await db.toolRun.deleteMany({ where: { userId: user.id } });
    await db.toolGrant.deleteMany({ where: { userId: user.id } });
    await db.toolOrder.deleteMany({ where: { userId: user.id } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});

test("refund preflight never auto-approves ledger discrepancies or previous processed refunds", () => {
  const assessed = assessRefundSnapshot("T" + "a".repeat(30), {
    provider: "WECHAT", status: "PAID", amountFen: 990, credits: 20,
    providerTradeId: "WECHAT:tx-123", refundHold: true,
    grant: {
      total: 20, remaining: 20,
      runs: [{ status: "SUCCEEDED" }],
    },
    refundCases: [{ status: "OPEN" }, { status: "PROCESSING" }],
  });
  assert.ok(assessed.issues.includes("LEDGER_MISMATCH"));
  assert.ok(assessed.issues.includes("PREVIOUS_REFUND_UNRESOLVED"));
  assert.ok(assessed.issues.includes("CONSUMED_CREDITS"));
  assert.equal(assessed.review, "NEEDS_RECONCILIATION");
  assert.equal(assessed.automaticallyRefundable, false);
});
