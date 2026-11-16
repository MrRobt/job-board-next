import {parseWechat} from "@/lib/payment/wechat";import {settleToolPayment} from "@/lib/career/billing";
export const runtime="nodejs";
export async function POST(req:Request){try{const raw=await req.text();if(raw.length>65536)throw new Error("Oversized notification");const notice=parseWechat(req.headers,raw);if(notice)await settleToolPayment(notice);return new Response(null,{status:204});}catch{return Response.json({code:"FAIL",message:"Notification rejected"},{status:400});}}
