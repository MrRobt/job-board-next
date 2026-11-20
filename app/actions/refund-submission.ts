"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {allowAttempt} from "@/lib/rate-limit";
import {submitPreparedRefundOnce} from "@/lib/career/refund-sender";
import {refundSubmissionEnabled} from "@/lib/payment/refund-submit";

/** Deliberate one-shot, financially sensitive operation.
 * All merchant, role and ledger checks are repeated inside the claim transaction.
 */
export async function submitAuthorizedRefund(dispatchId:string,form:FormData){
 const admin=await requireAdmin();
 const dispatch=await db.toolRefundDispatch.findUnique({
  where:{id:dispatchId},
  include:{intent:{include:{order:{select:{provider:true}}}}}
 });
 if(!dispatch||dispatch.state!=="READY"||
    (dispatch.intent.order.provider!=="ALIPAY"&&dispatch.intent.order.provider!=="WECHAT")||
    !refundSubmissionEnabled(dispatch.intent.order.provider)||
    form.get("confirmed")!=="yes"||
    form.get("outRefundNo")!==dispatch.outRefundNo||
    !await allowAttempt("refund-send",admin.id,3,600)){
  redirect("/admin/refund-dispatch?sendError=1");
 }
 let result:"IN_DOUBT";
 try{
  result=await submitPreparedRefundOnce(dispatch.id,admin.id);
 }catch{
  // Even an HTTP timeout could mean money left the merchant account.
  // Surface inquiry-only guidance. Never submit again automatically.
  redirect("/admin/refund-dispatch?sendUncertain=1");
 }
 revalidatePath("/admin/refund-dispatch");
 revalidatePath("/admin/tool-orders");
 redirect("/admin/refund-dispatch?sendResult="+result);
}
