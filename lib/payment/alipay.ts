import "server-only";
import {canonical,sign,verify,yuanToFen} from "./crypto";
import {env,origin} from "./config";
import type {PaymentNotice} from "./settlement";
function localTimestamp(){return new Date(Date.now()+8*3600000).toISOString().slice(0,19).replace("T"," ");}
export function createAlipayUrl(order:{id:string;amountFen:number;jobId:string}){
 const gateway=process.env.ALIPAY_GATEWAY||"https://openapi.alipay.com/gateway.do";
 const target=new URL(gateway);
 if(target.href!=="https://openapi.alipay.com/gateway.do"&&target.href!=="https://openapi-sandbox.dl.alipaydev.com/gateway.do")throw new Error("Unsupported gateway");
 const params:Record<string,string>={app_id:env("ALIPAY_APP_ID"),method:"alipay.trade.page.pay",format:"JSON",charset:"utf-8",sign_type:"RSA2",timestamp:localTimestamp(),version:"1.0",notify_url:origin()+"/api/payment/alipay/notify",return_url:origin()+"/account",biz_content:JSON.stringify({out_trade_no:order.id,total_amount:(order.amountFen/100).toFixed(2),subject:"职讯集招聘信息服务",product_code:"FAST_INSTANT_TRADE_PAY",timeout_express:"15m"})};
 params.sign=sign(canonical(params),env("ALIPAY_PRIVATE_KEY"));
 target.search=new URLSearchParams(params).toString();return target.toString();
}
export function parseAlipay(raw:string):PaymentNotice|null{
 const entries=[...new URLSearchParams(raw)];if(new Set(entries.map(([k])=>k)).size!==entries.length)throw new Error("Duplicate field");
 const params=Object.fromEntries(entries);const {sign:signature,sign_type,...rest}=params;
 if(sign_type!=="RSA2"||!signature||!verify(canonical(rest),signature,env("ALIPAY_PUBLIC_KEY")))throw new Error("Invalid signature");
 if(rest.app_id!==env("ALIPAY_APP_ID")||rest.seller_id!==env("ALIPAY_SELLER_ID"))throw new Error("Merchant mismatch");
 if(!["TRADE_SUCCESS","TRADE_FINISHED"].includes(rest.trade_status))return null;
 if(!rest.out_trade_no||!rest.trade_no)throw new Error("Missing transaction");
 return {provider:"ALIPAY",orderId:rest.out_trade_no,tradeId:rest.trade_no,amountFen:yuanToFen(rest.total_amount??"")};
}
