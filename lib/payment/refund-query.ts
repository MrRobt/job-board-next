import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { canonical, sign, verify, yuanToFen } from "./crypto";
import { env, type Channel } from "./config";
import { extractAlipaySignedObject } from "./merchant-gateway";

/**
 * Read-only merchant refund inquiry. Neither a successful HTTP response nor a
 * successful refund *request* is proof that money has been returned.
 * This module must never update orders, cases, grants, or issue refunds.
 */
export type RefundInquiry = {
  orderId: string;
  outRefundNo: string;
  providerTradeId: string;
  originalAmountFen: number;
  refundAmountFen: number;
};
export type RefundInquiryState = "SUCCEEDED" | "PROCESSING" | "FAILED" | "UNKNOWN";
export type RefundInquiryObservation = {
  state: RefundInquiryState;
  provider: Channel;
  orderId: string;
  outRefundNo: string;
  refundAmountFen: number;
};
export interface RefundInquiryGateway {
  query(provider: Channel, inquiry: RefundInquiry): Promise<RefundInquiryObservation>;
}

const maxBytes = 100_000;
const wechatHost = "https://api.mch.weixin.qq.com";
const alipayEndpoints = [
  "https://openapi.alipay.com/gateway.do",
  "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
] as const;

export function validateRefundInquiry(inquiry: RefundInquiry): void {
  if (!/^T[a-f0-9]{30}$/.test(inquiry.orderId)) throw new Error("Invalid merchant order id");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(inquiry.outRefundNo)) throw new Error("Invalid refund id");
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(inquiry.providerTradeId)) throw new Error("Invalid provider trade id");
  if (!Number.isSafeInteger(inquiry.originalAmountFen) || inquiry.originalAmountFen <= 0 ||
      !Number.isSafeInteger(inquiry.refundAmountFen) || inquiry.refundAmountFen <= 0 ||
      inquiry.refundAmountFen > inquiry.originalAmountFen) throw new Error("Invalid refund amount");
}

/** An explicit, separate merchant-read gate, never silently enabled. */
export function refundInquiryEnabled(provider: Channel): boolean {
  if (process.env.ENABLE_REAL_PAYMENT !== "true" ||
      process.env.ENABLE_REFUND_QUERY !== "true") return false;
  const required = provider === "WECHAT"
    ? ["WECHAT_MCH_ID", "WECHAT_MERCHANT_SERIAL", "WECHAT_PRIVATE_KEY",
       "WECHAT_PAY_PUBLIC_KEY_ID", "WECHAT_PAY_PUBLIC_KEY"]
    : ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"];
  try {
    for (const name of required) env(name);
    return true;
  } catch {
    return false;
  }
}

function checkIdentity(actual: string, expected: string, description: string): void {
  if (actual !== expected) throw new Error("Merchant refund " + description + " mismatch");
}

function checkedObservation(
  provider: Channel, inquiry: RefundInquiry, state: RefundInquiryState
): RefundInquiryObservation {
  return { provider, orderId: inquiry.orderId, outRefundNo: inquiry.outRefundNo,
    refundAmountFen: inquiry.refundAmountFen, state };
}

async function queryWechat(inquiry: RefundInquiry): Promise<RefundInquiryObservation> {
  const path = "/v3/refund/domestic/refunds/" + encodeURIComponent(inquiry.outRefundNo);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signature = sign("GET\n" + path + "\n" + timestamp + "\n" + nonce + "\n\n",
    env("WECHAT_PRIVATE_KEY"));
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${env("WECHAT_MCH_ID")}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env("WECHAT_MERCHANT_SERIAL")}",signature="${signature}"`;
  const response = await fetch(wechatHost + path, {
    method: "GET", headers: {
      Authorization: authorization,
      Accept: "application/json",
      "Wechatpay-Serial": env("WECHAT_PAY_PUBLIC_KEY_ID"),
    },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Refund inquiry HTTP failed");
  const raw = await response.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new Error("Oversized refund inquiry response");
  const replyTimestamp = response.headers.get("wechatpay-timestamp") ?? "";
  const replyNonce = response.headers.get("wechatpay-nonce") ?? "";
  const serial = response.headers.get("wechatpay-serial") ?? "";
  const replySignature = response.headers.get("wechatpay-signature") ?? "";
  if (!/^\d{10}$/.test(replyTimestamp) ||
      Math.abs(Date.now() / 1000 - Number(replyTimestamp)) > 300 ||
      !replyNonce || !replySignature ||
      serial !== env("WECHAT_PAY_PUBLIC_KEY_ID") ||
      !verify(replyTimestamp + "\n" + replyNonce + "\n" + raw + "\n",
        replySignature, env("WECHAT_PAY_PUBLIC_KEY"))) {
    throw new Error("Unverified WeChat refund response");
  }
  const body = z.object({
    out_trade_no: z.string(),
    transaction_id: z.string(),
    out_refund_no: z.string(),
    status: z.string(),
    amount: z.object({
      total: z.number().int().positive(),
      refund: z.number().int().positive(),
      currency: z.literal("CNY"),
    }),
  }).parse(JSON.parse(raw));
  checkIdentity(body.out_trade_no, inquiry.orderId, "order");
  checkIdentity(body.out_refund_no, inquiry.outRefundNo, "request");
  checkIdentity(body.transaction_id, inquiry.providerTradeId, "transaction");
  if (body.amount.total !== inquiry.originalAmountFen ||
      body.amount.refund !== inquiry.refundAmountFen) throw new Error("Refund money mismatch");
  const state: RefundInquiryState = body.status === "SUCCESS" ? "SUCCEEDED"
    : body.status === "PROCESSING" ? "PROCESSING"
    : body.status === "CLOSED" ? "FAILED" : "UNKNOWN";
  return checkedObservation("WECHAT", inquiry, state);
}

function alipayGatewayUrl(): string {
  const url = process.env.ALIPAY_GATEWAY ?? alipayEndpoints[0];
  if (!alipayEndpoints.includes(url as typeof alipayEndpoints[number])) {
    throw new Error("Unsupported Alipay endpoint");
  }
  return url;
}
async function queryAlipay(inquiry: RefundInquiry): Promise<RefundInquiryObservation> {
  const method = "alipay.trade.fastpay.refund.query";
  const nowCst = new Date(Date.now() + 8 * 3600_000).toISOString()
    .slice(0, 19).replace("T", " ");
  const params: Record<string, string> = {
    app_id: env("ALIPAY_APP_ID"), method, format: "JSON",
    charset: "utf-8", sign_type: "RSA2", timestamp: nowCst, version: "1.0",
    biz_content: JSON.stringify({
      out_trade_no: inquiry.orderId,
      out_request_no: inquiry.outRefundNo,
    }),
  };
  params.sign = sign(canonical(params), env("ALIPAY_PRIVATE_KEY"));
  const response = await fetch(alipayGatewayUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams(params).toString(), cache: "no-store",
    redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Refund inquiry HTTP failed");
  const raw = await response.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new Error("Oversized refund inquiry response");
  const key = "alipay_trade_fastpay_refund_query_response";
  const result = JSON.parse(raw);
  if (typeof result.sign !== "string" ||
      !verify(extractAlipaySignedObject(raw, key), result.sign,
        env("ALIPAY_PUBLIC_KEY"))) throw new Error("Unverified Alipay refund response");
  const body = z.object({
    code: z.string(), out_trade_no: z.string(), out_request_no: z.string(),
    trade_no: z.string(), refund_amount: z.string(),
    total_amount: z.string().optional(), seller_id: z.string().optional(),
    refund_status: z.string().optional(),
  }).parse(result[key]);
  if (body.code !== "10000") throw new Error("Merchant refund query not successful");
  checkIdentity(body.out_trade_no, inquiry.orderId, "order");
  checkIdentity(body.out_request_no, inquiry.outRefundNo, "request");
  checkIdentity(body.trade_no, inquiry.providerTradeId, "transaction");
  if (body.seller_id && body.seller_id !== env("ALIPAY_SELLER_ID")) {
    throw new Error("Merchant refund seller mismatch");
  }
  if (yuanToFen(body.refund_amount) !== inquiry.refundAmountFen ||
      (body.total_amount !== undefined &&
       yuanToFen(body.total_amount) !== inquiry.originalAmountFen)) {
    throw new Error("Refund money mismatch");
  }
  // Alipay query code=10000 alone is NOT proof of refund success.
  // Absent/unknown refund_status requires manual investigation.
  const state: RefundInquiryState = body.refund_status === "REFUND_SUCCESS"
    ? "SUCCEEDED" : "UNKNOWN";
  return checkedObservation("ALIPAY", inquiry, state);
}

export const liveRefundInquiryGateway: RefundInquiryGateway = {
  async query(provider, inquiry) {
    validateRefundInquiry(inquiry);
    if (provider !== "WECHAT" && provider !== "ALIPAY")
      throw new Error("Unsupported refund provider");
    if (!refundInquiryEnabled(provider)) throw new Error("Refund inquiry disabled");
    return provider === "WECHAT" ? queryWechat(inquiry) : queryAlipay(inquiry);
  },
};
