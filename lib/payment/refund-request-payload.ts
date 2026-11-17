import { createHash } from "node:crypto";

/**
 * Deterministic refund REQUEST payloads, not a refund execution API.
 *
 * Only call after a durable, authorized, reviewed refund intent has been
 * recorded. Persist the returned id/fingerprint BEFORE any merchant request,
 * and compare the fingerprint on every retry. No network or DB I/O here.
 */
export type RefundProvider = "ALIPAY" | "WECHAT";
export type MerchantRefundIntent = {
  caseId: string;
  orderId: string;
  provider: RefundProvider;
  providerTradeId: string;
  originalAmountFen: number;
  refundAmountFen: number;
  reason: string;
};

export type PreparedRefund = {
  outRefundNo: string;
  fingerprint: string;
  amountFen: number;
  originalAmountFen: number;
  orderId: string;
  reason: string;
};

function validate(intent: MerchantRefundIntent): void {
  if (!/^[A-Za-z0-9_-]{6,191}$/.test(intent.caseId)) throw new Error("Invalid persisted refund case");
  if (!/^T[a-f0-9]{30}$/.test(intent.orderId)) throw new Error("Invalid merchant order");
  if (intent.provider !== "ALIPAY" && intent.provider !== "WECHAT") throw new Error("Unsupported refund provider");
  if (!intent.providerTradeId.startsWith(intent.provider + ":") ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(intent.providerTradeId.slice(intent.provider.length + 1))) {
    throw new Error("Missing payment reference");
  }
  if (!Number.isSafeInteger(intent.originalAmountFen) ||
      !Number.isSafeInteger(intent.refundAmountFen) ||
      intent.originalAmountFen <= 0 || intent.originalAmountFen > 999_999_999 ||
      intent.refundAmountFen <= 0 || intent.refundAmountFen > intent.originalAmountFen) {
    throw new Error("Invalid integer amount");
  }
  const reason = intent.reason.trim();
  if (!reason || [...reason].length > 80 ||
      /[\u0000-\u001f\u007f]/.test(intent.reason)) throw new Error("Invalid refund reason");
}

export function prepareMerchantRefund(
  intent: MerchantRefundIntent, expectedFingerprint?: string
): PreparedRefund {
  validate(intent);
  const reason = intent.reason.trim();
  const outRefundNo = "R" + createHash("sha256")
    .update("job-board-refund-request-v1\0" + intent.orderId + "\0" + intent.caseId)
    .digest("hex").slice(0, 30);
  // The fingerprint is stable across retries; it is a change detector, not
  // a merchant signature or authorization. The DB must store it durably.
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([
      intent.caseId, intent.orderId, intent.provider, intent.providerTradeId,
      intent.originalAmountFen, intent.refundAmountFen, reason,
    ])).digest("hex");
  if (expectedFingerprint !== undefined && expectedFingerprint !== fingerprint) {
    throw new Error("Refund intent differs from recorded request");
  }
  return {
    outRefundNo, fingerprint,
    orderId: intent.orderId, originalAmountFen: intent.originalAmountFen,
    amountFen: intent.refundAmountFen, reason,
  };
}

/** A WeChat API v3 body; no POST/credentials/merchant invocation occurs here. */
export function wechatRefundPayload(intent: MerchantRefundIntent, expectedFingerprint?: string) {
  if (intent.provider !== "WECHAT") throw new Error("Expected WeChat refund");
  const prepared = prepareMerchantRefund(intent, expectedFingerprint);
  return {
    out_trade_no: prepared.orderId,
    out_refund_no: prepared.outRefundNo,
    reason: prepared.reason,
    amount: { refund: prepared.amountFen, total: prepared.originalAmountFen, currency: "CNY" as const },
  };
}

/** A signed-by-caller Alipay biz_content object; no POST occurs here. */
export function alipayRefundPayload(intent: MerchantRefundIntent, expectedFingerprint?: string) {
  if (intent.provider !== "ALIPAY") throw new Error("Expected Alipay refund");
  const prepared = prepareMerchantRefund(intent, expectedFingerprint);
  return {
    out_trade_no: prepared.orderId,
    out_request_no: prepared.outRefundNo,
    refund_amount: (prepared.amountFen / 100).toFixed(2),
    refund_reason: prepared.reason,
  };
}
