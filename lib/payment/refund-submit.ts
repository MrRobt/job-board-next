import "server-only";
import {randomBytes} from "node:crypto";
import {z} from "zod";
import {canonical,sign,verify} from "./crypto";
import {assertAlipayRefundReplyAmount} from "./refund-submit-amount";
import {env} from "./config";
import {extractAlipaySignedObject} from "./merchant-gateway";
import {readBoundedHttpText} from "../http-body-limit";
import {
 prepareMerchantRefund,wechatRefundPayload,alipayRefundPayload,
 type MerchantRefundIntent,type RefundProvider
} from "./refund-request-payload";

/** This is an outbound money-moving API. Caller MUST claim the durable outbox first. */
export interface RefundSubmissionGateway {
 submit(intent:MerchantRefundIntent,fingerprint:string):Promise<"ACKNOWLEDGED">;
}
const maxBody=100_000;
const wechatUrl="https://api.mch.weixin.qq.com/v3/refund/domestic/refunds";
const alipayEndpoints=[
 "https://openapi.alipay.com/gateway.do",
 "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
] as const;

/** Never enabled by merchant credentials alone, or by the read-only refund query flag. */
export function refundSubmissionEnabled(provider:RefundProvider){
 if(process.env.ENABLE_REAL_PAYMENT!=="true"||
    process.env.ENABLE_REFUND_DISPATCH_CLAIM!=="true"||
    process.env.ENABLE_REFUND_SEND!=="true")return false;
 const names=provider==="WECHAT"
  ? ["WECHAT_APP_ID","WECHAT_MCH_ID","WECHAT_MERCHANT_SERIAL","WECHAT_PRIVATE_KEY",
     "WECHAT_PAY_PUBLIC_KEY_ID","WECHAT_PAY_PUBLIC_KEY"]
  : ["ALIPAY_APP_ID","ALIPAY_SELLER_ID","ALIPAY_PRIVATE_KEY","ALIPAY_PUBLIC_KEY"];
 try{for(const name of names)env(name);return true;}catch{return false;}
}
function assertEnabled(provider:RefundProvider){
 if(!refundSubmissionEnabled(provider))throw new Error("Merchant refund submission disabled");
}
function checkIdentity(actual:string,expected:string,field:string){
 if(actual!==expected)throw new Error("Refund submission "+field+" mismatch");
}
async function sendWechat(intent:MerchantRefundIntent,fingerprint:string){
 const prepared=prepareMerchantRefund(intent,fingerprint);
 const body=JSON.stringify(wechatRefundPayload(intent,fingerprint));
 const path="/v3/refund/domestic/refunds";
 const timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString("hex");
 const signature=sign("POST\n"+path+"\n"+timestamp+"\n"+nonce+"\n"+body+"\n",env("WECHAT_PRIVATE_KEY"));
 const authorization=`WECHATPAY2-SHA256-RSA2048 mchid="${env("WECHAT_MCH_ID")}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env("WECHAT_MERCHANT_SERIAL")}",signature="${signature}"`;
 const response=await fetch(wechatUrl,{
  method:"POST",headers:{
   Authorization:authorization,Accept:"application/json","Content-Type":"application/json",
   "Wechatpay-Serial":env("WECHAT_PAY_PUBLIC_KEY_ID")
  },body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15_000)
 });
 if(!response.ok)throw new Error("Merchant refund submission HTTP failed; inquiry required");
 const raw=await readBoundedHttpText(response,maxBody);
 const replyTimestamp=response.headers.get("wechatpay-timestamp")??"";
 const replyNonce=response.headers.get("wechatpay-nonce")??"";
 const serial=response.headers.get("wechatpay-serial")??"";
 const replySignature=response.headers.get("wechatpay-signature")??"";
 if(!/^\d{10}$/.test(replyTimestamp)||
    Math.abs(Date.now()/1000-Number(replyTimestamp))>300||!replyNonce||!replySignature||
    serial!==env("WECHAT_PAY_PUBLIC_KEY_ID")||
    !verify(replyTimestamp+"\n"+replyNonce+"\n"+raw+"\n",replySignature,env("WECHAT_PAY_PUBLIC_KEY")))
  throw new Error("Unverified WeChat refund response; inquiry required");
 const result=z.object({
  out_trade_no:z.string(),out_refund_no:z.string(),transaction_id:z.string().optional(),
  status:z.string(),
  amount:z.object({refund:z.number().int().positive(),total:z.number().int().positive(),
   currency:z.literal("CNY")})
 }).parse(JSON.parse(raw));
 checkIdentity(result.out_trade_no,prepared.orderId,"order");
 checkIdentity(result.out_refund_no,prepared.outRefundNo,"request");
 checkIdentity(result.transaction_id??"",intent.providerTradeId.slice("WECHAT:".length),"transaction");
 if(result.amount.total!==prepared.originalAmountFen||result.amount.refund!==prepared.amountFen)
  throw new Error("Refund submission amount mismatch");
 if(result.status!=="SUCCESS"&&result.status!=="PROCESSING")
  throw new Error("WeChat refund submission status uncertain; inquiry required");
 // 200 and even status=SUCCESS are NOT a local refund settlement proof.
 return "ACKNOWLEDGED" as const;
}
async function sendAlipay(intent:MerchantRefundIntent,fingerprint:string){
 const prepared=prepareMerchantRefund(intent,fingerprint);
 const endpoint=process.env.ALIPAY_GATEWAY??alipayEndpoints[0];
 if(!alipayEndpoints.includes(endpoint as (typeof alipayEndpoints)[number]))
  throw new Error("Unsupported Alipay gateway");
 const params:Record<string,string>={
  app_id:env("ALIPAY_APP_ID"),method:"alipay.trade.refund",format:"JSON",charset:"utf-8",
  sign_type:"RSA2",timestamp:new Date(Date.now()+8*3600_000).toISOString().slice(0,19).replace("T"," "),
  version:"1.0",biz_content:JSON.stringify(alipayRefundPayload(intent,fingerprint))
 };
 params.sign=sign(canonical(params),env("ALIPAY_PRIVATE_KEY"));
 const response=await fetch(endpoint,{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
  body:new URLSearchParams(params).toString(),cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(15_000)
 });
 if(!response.ok)throw new Error("Alipay refund submission HTTP failed; inquiry required");
 const raw=await readBoundedHttpText(response,maxBody);
 const key="alipay_trade_refund_response";
 const responseObject=JSON.parse(raw);
 if(typeof responseObject.sign!=="string"||
    !verify(extractAlipaySignedObject(raw,key),responseObject.sign,env("ALIPAY_PUBLIC_KEY")))
  throw new Error("Unverified Alipay refund response; inquiry required");
 const result=z.object({
  code:z.string(),out_trade_no:z.string(),trade_no:z.string(),fund_change:z.string().optional(),
  refund_fee:z.string().optional(),seller_id:z.string().optional()
 }).parse(responseObject[key]);
 if(result.code!=="10000")throw new Error("Alipay refund rejected or uncertain; inquiry required");
 checkIdentity(result.out_trade_no,prepared.orderId,"order");
 checkIdentity(result.trade_no,intent.providerTradeId.slice("ALIPAY:".length),"transaction");
 if(result.seller_id!==undefined)checkIdentity(result.seller_id,env("ALIPAY_SELLER_ID"),"seller");
 assertAlipayRefundReplyAmount(result.refund_fee,prepared.amountFen);
 // Missing or divergent signed amount requires an independent merchant inquiry.
 // fund_change=Y, code=10000 and any signed POST reply still require independent inquiry.
 return "ACKNOWLEDGED" as const;
}

export const liveRefundSubmissionGateway:RefundSubmissionGateway={
 async submit(intent,fingerprint){
  assertEnabled(intent.provider);
  prepareMerchantRefund(intent,fingerprint);
  return intent.provider==="WECHAT"?sendWechat(intent,fingerprint):sendAlipay(intent,fingerprint);
 }
};
