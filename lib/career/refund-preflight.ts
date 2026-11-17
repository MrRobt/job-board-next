import "server-only";
import { db } from "../db";

/**
 * Read-only, advisory refund snapshot. It is NOT authorization to transfer
 * funds, release a hold, or revoke credits: the numbers can change after read.
 * Future fund-changing paths must re-check invariants under a DB transaction,
 * with a persisted idempotency key and verified merchant refund evidence.
 */
export type RefundPreflightIssue =
  | "NOT_PAID" | "MOCK_PAYMENT" | "NOT_FROZEN" | "NO_OPEN_REQUEST"
  | "MISSING_PAYMENT_REFERENCE" | "MISSING_GRANT" | "IN_FLIGHT"
  | "CONSUMED_CREDITS" | "LEDGER_MISMATCH" | "PREVIOUS_REFUND_UNRESOLVED";

export type RefundPreflight = {
  orderId: string;
  provider: "ALIPAY" | "WECHAT" | "MOCK";
  orderStatus: "PENDING" | "PAID" | "CLOSED" | "REFUNDED";
  amountFen: number;
  totalCredits: number;
  remainingCredits: number;
  succeededRuns: number;
  reservedRuns: number;
  failedRuns: number;
  refundHold: boolean;
  requestStatus: "OPEN" | "REJECTED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | null;
  issues: RefundPreflightIssue[];
  review: "NEEDS_RECONCILIATION" | "READY_FOR_MANUAL_REVIEW";
  // No preflight assessment ever authorizes movement of real funds.
  automaticallyRefundable: false;
};

type Snapshot = {
  provider: RefundPreflight["provider"];
  status: RefundPreflight["orderStatus"];
  amountFen: number;
  credits: number;
  providerTradeId: string | null;
  refundHold: boolean;
  grant: {
    total: number;
    remaining: number;
    runs: { status: "RESERVED" | "SUCCEEDED" | "FAILED" }[];
  } | null;
  refundCases: { status: NonNullable<RefundPreflight["requestStatus"]> }[];
};

export function assessRefundSnapshot(orderId: string, order: Snapshot): RefundPreflight {
  const statuses = order.grant?.runs ?? [];
  const reservedRuns = statuses.filter(r => r.status === "RESERVED").length;
  const succeededRuns = statuses.filter(r => r.status === "SUCCEEDED").length;
  const failedRuns = statuses.filter(r => r.status === "FAILED").length;
  const remainingCredits = order.grant?.remaining ?? 0;
  const issues: RefundPreflightIssue[] = [];
  const add = (value: RefundPreflightIssue) => { if (!issues.includes(value)) issues.push(value); };

  if (order.status !== "PAID") add("NOT_PAID");
  if (order.provider === "MOCK") add("MOCK_PAYMENT");
  if (!order.refundHold) add("NOT_FROZEN");
  const latest = order.refundCases[0]?.status ?? null;
  if (latest !== "OPEN") add("NO_OPEN_REQUEST");
  if (order.refundCases.some(c => c.status === "PROCESSING" || c.status === "SUCCEEDED")) {
    add("PREVIOUS_REFUND_UNRESOLVED");
  }
  if (!order.providerTradeId?.startsWith(order.provider + ":") ||
      order.providerTradeId.length <= order.provider.length + 1) add("MISSING_PAYMENT_REFERENCE");
  if (!order.grant) add("MISSING_GRANT");
  if (reservedRuns > 0) add("IN_FLIGHT");
  if (succeededRuns > 0) add("CONSUMED_CREDITS");
  if (!order.grant || order.grant.total !== order.credits ||
      order.grant.total < 0 || order.grant.remaining < 0 ||
      order.grant.remaining > order.grant.total ||
      order.grant.remaining + reservedRuns + succeededRuns !== order.grant.total) {
    add("LEDGER_MISMATCH");
  }
  return {
    orderId, provider: order.provider, orderStatus: order.status,
    amountFen: order.amountFen, totalCredits: order.credits, remainingCredits,
    succeededRuns, reservedRuns, failedRuns, refundHold: order.refundHold,
    requestStatus: latest, issues,
    review: issues.length ? "NEEDS_RECONCILIATION" : "READY_FOR_MANUAL_REVIEW",
    automaticallyRefundable: false,
  };
}

/** Only the payer or an administrator may inspect these financial counters. */
export async function readToolRefundPreflight(viewerId: string, orderId: string): Promise<RefundPreflight> {
  if (!/^T[a-f0-9]{30}$/.test(orderId)) throw new Error("Invalid order id");
  const viewer = await db.user.findUnique({ where: { id: viewerId }, select: { role: true } });
  if (!viewer) throw new Error("Not authorized to inspect this refund");
  const order = await db.toolOrder.findUnique({
    where: { id: orderId },
    select: {
      userId: true, provider: true, status: true, amountFen: true, credits: true,
      providerTradeId: true, refundHold: true,
      grant: {
        select: { total: true, remaining: true,
          runs: { select: { status: true } } },
      },
      refundCases: {
        select: { status: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });
  if (!order || (order.userId !== viewerId && viewer.role !== "ADMIN")) {
    throw new Error("Not authorized to inspect this refund");
  }
  return assessRefundSnapshot(orderId, order);
}
