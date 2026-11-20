"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/auth";
import {allowAttempt} from "@/lib/rate-limit";
import {reconcileDispatchedRefund} from "@/lib/career/refund-finalization";

/** Signed, read-only merchant inquiry followed by atomic terminal bookkeeping.
 * No action can issue or retry a merchant refund request.
 */
export async function inquireRefundDispatch(dispatchId:string,form:FormData){
 const admin=await requireAdmin();
 if(form.get("confirmed")!=="yes"||
    !await allowAttempt("refund-inquiry",admin.id,10,60))
  redirect("/admin/refund-dispatch?error=1");
 let result:string;
 try{
  result=await reconcileDispatchedRefund(dispatchId,admin.id);
 }catch{
  redirect("/admin/refund-dispatch?error=1");
 }
 revalidatePath("/admin/refund-dispatch");
 revalidatePath("/admin/tool-orders");
 revalidatePath("/account");
 redirect("/admin/refund-dispatch?result="+encodeURIComponent(result));
}
