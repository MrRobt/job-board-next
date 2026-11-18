import { prepareMerchantRefund, type MerchantRefundIntent } from "./refund-request-payload";
import type { RefundInquiry, RefundInquiryGateway, RefundInquiryObservation } from "./refund-query";

/**
 * Trusted, server-loaded snapshot of a persisted refund request and payment.
 * The future DB adapter must select it under operator authorization, verify
 * that the refund was durably dispatched, and never accept client-supplied
 * snapshots. This bridge is a pure/read-only compatibility boundary.
 */
export type RecordedRefundInquirySnapshot = {
  intent: MerchantRefundIntent;
  recordedOutRefundNo: string;
  recordedFingerprint: string;
  caseStatus: "OPEN" | "REJECTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  orderStatus: "PENDING" | "PAID" | "CLOSED" | "REFUNDED";
  refundHold: boolean;
  /** Verified durable dispatch record, not an HTTP 200 or a UI checkbox. */
  dispatchRecorded: boolean;
};

/**
 * Local ToolOrder.providerTradeId stores "WECHAT:xyz"/"ALIPAY:xyz" to
 * enforce cross-channel uniqueness. Provider refund inquiry APIs return the
 * *raw* transaction id. Passing the DB-prefixed value to either provider
 * would cause an otherwise valid signed response to be rejected.
 */
export function prepareRecordedRefundInquiry(record: RecordedRefundInquirySnapshot): RefundInquiry {
  if (record.orderStatus !== "PAID" || !record.refundHold ||
      record.caseStatus !== "PROCESSING" || record.dispatchRecorded !== true) {
    throw new Error("Refund inquiry lacks persisted dispatched processing state");
  }
  const prepared = prepareMerchantRefund(record.intent, record.recordedFingerprint);
  if (record.recordedOutRefundNo !== prepared.outRefundNo) {
    throw new Error("Persisted refund request ID mismatch");
  }
  const prefix = record.intent.provider + ":";
  const stored = record.intent.providerTradeId;
  if (!stored.startsWith(prefix)) throw new Error("Persisted payment channel mismatch");
  const rawTradeId = stored.slice(prefix.length);
  // Raw channel references cannot contain the local separator or URL syntax.
  // Reject a second prefix rather than silently stripping it or querying a
  // different transaction. Keep consistent with validateRefundInquiry.
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(rawTradeId)) {
    throw new Error("Invalid persisted provider transaction ID");
  }
  return {
    orderId: prepared.orderId,
    outRefundNo: prepared.outRefundNo,
    providerTradeId: rawTradeId,
    originalAmountFen: prepared.originalAmountFen,
    refundAmountFen: prepared.amountFen,
  };
}

/**
 * No default live gateway and NO state mutation. A verified successful
 * inquiry is evidence for a future independent, atomic ledger reconciliation,
 * NEVER permission to set REFUNDED or restore/revoke credits here.
 */
export async function queryRecordedRefund(
  record: RecordedRefundInquirySnapshot, gateway: RefundInquiryGateway
): Promise<RefundInquiryObservation> {
  const inquiry = prepareRecordedRefundInquiry(record);
  const observed = await gateway.query(record.intent.provider, inquiry);
  if (observed.provider !== record.intent.provider ||
      observed.orderId !== inquiry.orderId ||
      observed.outRefundNo !== inquiry.outRefundNo ||
      observed.refundAmountFen !== inquiry.refundAmountFen ||
      !["SUCCEEDED", "PROCESSING", "FAILED", "UNKNOWN"].includes(observed.state)) {
    throw new Error("Refund merchant observation does not match persisted request");
  }
  return observed;
}
