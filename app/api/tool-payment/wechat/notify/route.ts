import {parseWechat} from "@/lib/payment/wechat";import {settleToolPayment} from "@/lib/career/billing";
import {readBoundedHttpText} from "@/lib/http-body-limit";
export const runtime="nodejs";
export async function POST(req:Request){try{const raw=await readBoundedHttpText(req,65536);const notice=parseWechat(req.headers,raw);if(notice)await settleToolPayment(notice);return new Response(null,{status:204});}catch{return Response.json({code:"FAIL",message:"Notification rejected"},{status:400});}}
