import "server-only";
import {randomBytes} from "node:crypto";
import {z} from "zod";
import {canonical,sign,verify,yuanToFen} from "./crypto";
import {env} from "./config";
import type {Channel} from "./config";
import {checkedMerchantPayment,type MerchantObservation} from "./merchant-observation";
import {readBoundedHttpText} from "../http-body-limit";

/** No caller should interpret request success or local expiry as financial proof. */
export interface MerchantGateway {
 query(orderId:string,channel:Channel):Promise<MerchantObservation>;
 close(orderId:string,channel:Channel):Promise<void>;
}

const wechatHost="https://api.mch.weixin.qq.com";
const maxBody=100_000;
function wechatSignature(method:string,path:string,body:string){
 const mchid=env("WECHAT_MCH_ID");
 const timestamp=Math.floor(Date.now()/1000).toString();
 const nonce=randomBytes(16).toString("hex");
 const value=sign(method+"\n"+path+"\n"+timestamp+"\n"+nonce+"\n"+body+"\n",env("WECHAT_PRIVATE_KEY"));
 return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env("WECHAT_MERCHANT_SERIAL")}",signature="${value}"`;
}
function verifyWechatResponse(headers:Headers,raw:string){
 const timestamp=headers.get("wechatpay-timestamp")??"";
 const nonce=headers.get("wechatpay-nonce")??"";
 const serial=headers.get("wechatpay-serial")??"";
 const signature=headers.get("wechatpay-signature")??"";
 if(!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||
    !nonce||!signature||serial!==env("WECHAT_PAY_PUBLIC_KEY_ID")||
    !verify(timestamp+"\n"+nonce+"\n"+raw+"\n",signature,env("WECHAT_PAY_PUBLIC_KEY"))){
  throw new Error("Unverified WeChat API response");
 }
}
async function callWechat(method:"GET"|"POST",path:string,body=""){
 const res=await fetch(wechatHost+path,{
  method,headers:{Authorization:wechatSignature(method,path,body),Accept:"application/json",...(method==="POST"?{"Content-Type":"application/json"}:{})},
  ...(method==="POST"?{body}:{}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15_000)
 });
 // Do not trust or log unsigned error payloads.
 if(!res.ok)throw new Error("Merchant API request failed");
 // The close endpoint returns 204 with no body; it proves only request acceptance.
 // The caller must query again and verify a signed CLOSED state before changing the DB.
 if(method==="POST"&&res.status===204)return "";
 const raw=await readBoundedHttpText(res,maxBody);
 verifyWechatResponse(res.headers,raw);
 return raw;
}
async function queryWechat(orderId:string):Promise<MerchantObservation>{
 const mchid=env("WECHAT_MCH_ID");
 const raw=await callWechat("GET",`/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(mchid)}`);
 const body=z.object({
  appid:z.string(),mchid:z.string(),out_trade_no:z.string(),trade_state:z.string(),
  trade_type:z.string().optional(),transaction_id:z.string().optional(),
  amount:z.object({total:z.number().int(),currency:z.string()}).optional()
 }).parse(JSON.parse(raw));
 if(body.appid!==env("WECHAT_APP_ID")||body.mchid!==mchid||body.out_trade_no!==orderId)throw new Error("Merchant or order identity mismatch");
 if(body.trade_type&&body.trade_type!=="NATIVE")throw new Error("Unexpected WeChat trade type");
 if(body.trade_state==="SUCCESS"){
  if(body.amount?.currency!=="CNY")throw new Error("Unexpected currency");
  return checkedMerchantPayment("WECHAT",orderId,"PAID",body.amount.total,body.transaction_id);
 }
 if(body.trade_state==="NOTPAY")return {state:"UNPAID"};
 if(body.trade_state==="CLOSED")return {state:"CLOSED"};
 return {state:"UNKNOWN"};
}
async function closeWechat(orderId:string){
 await callWechat("POST",`/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}/close`,JSON.stringify({mchid:env("WECHAT_MCH_ID")}));
}
/** Extract the exact raw signed JSON object; do not re-serialize after parsing. */
export function extractAlipaySignedObject(raw:string,field:string){
 const key=JSON.stringify(field);
 const start=raw.indexOf(key);
 if(start<0||raw.indexOf(key,start+key.length)>=0)throw new Error("Missing or duplicate signed Alipay object");
 let i=start+key.length;
 while(/\s/.test(raw[i]??""))i++;
 if(raw[i++]!==":")throw new Error("Invalid signed payload");
 while(/\s/.test(raw[i]??""))i++;
 if(raw[i]!=="{")throw new Error("Missing response object");
 let quoted=false,escape=false,depth=0;
 const begin=i;
 for(;i<raw.length;i++){
  const c=raw[i];
  if(quoted){
   if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quoted=false;
  }else if(c==='"')quoted=true;
  else if(c==="{")depth++;
  else if(c==="}"&&--depth===0)return raw.slice(begin,i+1);
 }
 throw new Error("Truncated signed response");
}
function alipayGateway(){
 const url=new URL(process.env.ALIPAY_GATEWAY??"https://openapi.alipay.com/gateway.do");
 if(!["https://openapi.alipay.com/gateway.do","https://openapi-sandbox.dl.alipaydev.com/gateway.do"].includes(url.href))throw new Error("Unsupported Alipay endpoint");
 return url.href;
}
function alipayTimestamp(){return new Date(Date.now()+8*3600_000).toISOString().slice(0,19).replace("T"," ");}
async function callAlipay(method:"alipay.trade.query"|"alipay.trade.close",orderId:string){
 const params:Record<string,string>={
  app_id:env("ALIPAY_APP_ID"),method,format:"JSON",charset:"utf-8",sign_type:"RSA2",
  timestamp:alipayTimestamp(),version:"1.0",biz_content:JSON.stringify({out_trade_no:orderId})
 };
 params.sign=sign(canonical(params),env("ALIPAY_PRIVATE_KEY"));
 const res=await fetch(alipayGateway(),{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
  body:new URLSearchParams(params).toString(),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15_000)
 });
 if(!res.ok)throw new Error("Alipay request failed");
 const raw=await readBoundedHttpText(res,maxBody);
 const key=method.replaceAll(".","_")+"_response";
 const result=JSON.parse(raw);
 if(typeof result.sign!=="string"||!verify(extractAlipaySignedObject(raw,key),result.sign,env("ALIPAY_PUBLIC_KEY")))throw new Error("Unverified Alipay response");
 const details=result[key];
 if(!details||details.code!=="10000")throw new Error("Alipay business response not successful");
 if(details.out_trade_no!==orderId)throw new Error("Alipay order mismatch");
 return details;
}
async function queryAlipay(orderId:string):Promise<MerchantObservation>{
 const data=await callAlipay("alipay.trade.query",orderId);
 if(data.seller_id!==env("ALIPAY_SELLER_ID"))throw new Error("Alipay seller mismatch");
 if(["TRADE_SUCCESS","TRADE_FINISHED"].includes(data.trade_status)){
  return checkedMerchantPayment("ALIPAY",orderId,"PAID",yuanToFen(data.total_amount??""),data.trade_no);
 }
 if(data.trade_status==="WAIT_BUYER_PAY")return {state:"UNPAID"};
 if(data.trade_status==="TRADE_CLOSED")return {state:"CLOSED"};
 return {state:"UNKNOWN"};
}
async function closeAlipay(orderId:string){
 const data=await callAlipay("alipay.trade.close",orderId);
 if(data.trade_no&&typeof data.trade_no!=="string")throw new Error("Invalid close response");
}
export const liveGateway:MerchantGateway={
 query(orderId,channel){return channel==="WECHAT"?queryWechat(orderId):queryAlipay(orderId);},
 async close(orderId,channel){if(channel==="WECHAT")await closeWechat(orderId);else await closeAlipay(orderId);}
};
