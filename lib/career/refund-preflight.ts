/**
 * Pure, read-only refund risk assessment.
 *
 * The caller must obtain an authorized, consistent snapshot of exactly one
 * payer's order/credit ledger and order the refund cases newest-first.
 * This function has NO database access, NO merchant calls and NO authority to
 * transfer funds, release holds, or revoke entitlements.
 *
 * The authorized DB adapter must be implemented only after its refund schema
 * and migration are committed and verified independently.
 */
export type RefundPreflightIssue =
  | "NOT_PAID" | "MOCK_PAYMENT" | "NOT_FROZEN" | "NO_OPEN_REQUEST"
  | "MISSING_PAYMENT_REFERENCE" | "MISSING_GRANT" | "IN_FLIGHT"
  | "CONSUMED_CREDITS" | "LEDGER_MISMATCH" | "PREVIOUS_REFUND_UNRESOLVED"
  | "INVALID_ORDER_AMOUNT";

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
  requestStatus: "OPEN" | "PREPARED" | "REJECTED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | null;
  issues: RefundPreflightIssue[];
  review: "NEEDS_RECONCILIATION" | "READY_FOR_MANUAL_REVIEW";
  automaticallyRefundable: false;
};

export type RefundSnapshot = {
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
  /** Most recent first. Untrusted clients must never provide this snapshot. */
  refundCases: { status: NonNullable<RefundPreflight["requestStatus"]> }[];
};

export function assessRefundSnapshot(orderId: string, order: RefundSnapshot): RefundPreflight {
  if (!/^T[a-f0-9]{30}$/.test(orderId)) throw new Error("Invalid refund order id");
  const statuses = order.grant?.runs ?? [];
  const reservedRuns = statuses.filter(r => r.status === "RESERVED").length;
  const succeededRuns = statuses.filter(r => r.status === "SUCCEEDED").length;
  const failedRuns = statuses.filter(r => r.status === "FAILED").length;
  const remainingCredits = order.grant?.remaining ?? 0;
  const issues: RefundPreflightIssue[] = [];
  const add = (value: RefundPreflightIssue) => { if (!issues.includes(value)) issues.push(value); };

  if (!Number.isSafeInteger(order.amountFen) || order.amountFen <= 0) add("INVALID_ORDER_AMOUNT");
  if (order.status !== "PAID") add("NOT_PAID");
  if (order.provider === "MOCK") add("MOCK_PAYMENT");
  if (!order.refundHold) add("NOT_FROZEN");

  const latest = order.refundCases[0]?.status ?? null;
  if (latest !== "OPEN") add("NO_OPEN_REQUEST");
  if (order.refundCases.some(c => c.status === "PREPARED" || c.status === "PROCESSING" || c.status === "SUCCEEDED")) {
    add("PREVIOUS_REFUND_UNRESOLVED");
  }
  // A local trade reference is NOT proof of merchant payment authenticity.
  if (!order.providerTradeId?.startsWith(order.provider + ":") ||
      order.providerTradeId.length <= order.provider.length + 1) add("MISSING_PAYMENT_REFERENCE");
  if (!order.grant) add("MISSING_GRANT");
  if (reservedRuns > 0) add("IN_FLIGHT");
  if (succeededRuns > 0) add("CONSUMED_CREDITS");
  if (!order.grant || order.grant.total !== order.credits ||
      !Number.isSafeInteger(order.grant.total) ||
      !Number.isSafeInteger(order.grant.remaining) ||
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
