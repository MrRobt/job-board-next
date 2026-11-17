import "server-only";
import {randomBytes} from "node:crypto";
import {z} from "zod";
import {sign,verify,decryptResource} from "./crypto";
import {env,origin} from "./config";
import type {PaymentNotice} from "./settlement";
import {readBoundedHttpText} from "../http-body-limit";
function verifyMessage(headers:Headers,body:string){
 const timestamp=headers.get("wechatpay-timestamp")||"",nonce=headers.get("wechatpay-nonce")||"",serial=headers.get("wechatpay-serial")||"",signature=headers.get("wechatpay-signature")||"";
 if(!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||!nonce||!signature||serial!==env("WECHAT_PAY_PUBLIC_KEY_ID")||!verify(timestamp+"\n"+nonce+"\n"+body+"\n",signature,env("WECHAT_PAY_PUBLIC_KEY")))throw new Error("Invalid WeChat signature");
}
export async function createWechatUrl(order:{id:string;amountFen:number;paymentExpiresAt:Date|null;tool?:boolean}){
 const path="/v3/pay/transactions/native",timestamp=Math.floor(Date.now()/1000).toString(),nonce=randomBytes(16).toString("hex");
 const mchid=env("WECHAT_MCH_ID");
 const body=JSON.stringify({appid:env("WECHAT_APP_ID"),mchid,description:order.tool?"职讯集求职工具调用次数包":"职讯集历史招聘信息服务",out_trade_no:order.id,time_expire:order.paymentExpiresAt?.toISOString().replace(/\.\d{3}Z$/,"+00:00"),notify_url:origin()+(order.tool?"/api/tool-payment/wechat/notify":"/api/payment/wechat/notify"),amount:{total:order.amountFen,currency:"CNY"}});
 const signature=sign("POST\n"+path+"\n"+timestamp+"\n"+nonce+"\n"+body+"\n",env("WECHAT_PRIVATE_KEY"));
 const authorization='WECHATPAY2-SHA256-RSA2048 mchid="'+mchid+'",nonce_str="'+nonce+'",timestamp="'+timestamp+'",serial_no="'+env("WECHAT_MERCHANT_SERIAL")+'",signature="'+signature+'"';
 const res=await fetch("https://api.mch.weixin.qq.com"+path,{method:"POST",headers:{Authorization:authorization,Accept:"application/json","Content-Type":"application/json"},body,cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error("WeChat order request failed");
 const raw=await readBoundedHttpText(res,100_000);
 verifyMessage(res.headers,raw);
 return z.object({code_url:z.string().startsWith("weixin://wxpay/")}).parse(JSON.parse(raw)).code_url;
}
export function parseWechat(headers:Headers,raw:string):PaymentNotice|null{
 verifyMessage(headers,raw);
 const event=z.object({event_type:z.string(),resource:z.object({algorithm:z.string(),ciphertext:z.string(),nonce:z.string(),associated_data:z.string().optional()})}).parse(JSON.parse(raw));
 if(event.event_type!=="TRANSACTION.SUCCESS")return null;
 const data=z.object({appid:z.string(),mchid:z.string(),out_trade_no:z.string().min(1),transaction_id:z.string().min(1),trade_state:z.literal("SUCCESS"),amount:z.object({total:z.number().int().positive(),currency:z.literal("CNY")})}).parse(JSON.parse(decryptResource(event.resource,env("WECHAT_API_V3_KEY"))));
 if(data.appid!==env("WECHAT_APP_ID")||data.mchid!==env("WECHAT_MCH_ID"))throw new Error("Merchant mismatch");
 return {provider:"WECHAT",orderId:data.out_trade_no,tradeId:data.transaction_id,amountFen:data.amount.total};
}
