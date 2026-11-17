import {parseWechat} from "@/lib/payment/wechat";
import {settlePayment} from "@/lib/payment/settlement";
import {readBoundedHttpText} from "@/lib/http-body-limit";
export const runtime="nodejs";
export async function POST(req:Request){try{const raw=await readBoundedHttpText(req,65536);const notice=parseWechat(req.headers,raw);if(notice)await settlePayment(notice);return new Response(null,{status:204});}catch{return Response.json({code:"FAIL",message:"Notification rejected; retry or reconcile"},{status:400});}}
