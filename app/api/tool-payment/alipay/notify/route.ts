import {parseAlipay} from "@/lib/payment/alipay";import {settleToolPayment} from "@/lib/career/billing";
export const runtime="nodejs";
export async function POST(req:Request){try{const raw=await req.text();if(raw.length>65536)throw new Error("Oversized notification");const notice=parseAlipay(raw);if(notice)await settleToolPayment(notice);return new Response("success");}catch{return new Response("failure",{status:400});}}
