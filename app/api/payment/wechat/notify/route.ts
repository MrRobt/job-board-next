import {parseWechat} from "@/lib/payment/wechat";
import {settlePayment} from "@/lib/payment/settlement";
export const runtime="nodejs";
export async function POST(req:Request){try{const raw=await req.text();if(raw.length>65536)throw new Error("Oversized notification");const notice=parseWechat(req.headers,raw);if(notice)await settlePayment(notice);return new Response(null,{status:204});}catch{return Response.json({code:"FAIL",message:"Notification rejected; retry or reconcile"},{status:400});}}
