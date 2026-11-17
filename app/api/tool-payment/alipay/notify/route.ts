import {parseAlipay} from "@/lib/payment/alipay";import {settleToolPayment} from "@/lib/career/billing";
import {readBoundedHttpText} from "@/lib/http-body-limit";
export const runtime="nodejs";
export async function POST(req:Request){try{const raw=await readBoundedHttpText(req,65536);const notice=parseAlipay(raw);if(notice)await settleToolPayment(notice);return new Response("success");}catch{return new Response("failure",{status:400});}}
