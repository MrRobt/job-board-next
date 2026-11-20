"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireAdmin} from "@/lib/auth";
import {approveRefundIntent} from "@/lib/career/refund-approvals";

/** Internal two-person approval only. No merchant request is ever made here. */
export async function approveRefundAction(intentId:string,form:FormData){
 const admin=await requireAdmin();
 const reason=z.string().trim().min(10).max(500).safeParse(form.get("reason"));
 if(form.get("confirmed")!=="yes"||!reason.success)
  redirect("/admin/tool-orders?refundApprovalError=1");
 try{
  await approveRefundIntent(intentId,admin.id,reason.data);
 }catch{
  redirect("/admin/tool-orders?refundApprovalError=1");
 }
 revalidatePath("/admin/tool-orders");
 revalidatePath("/account");
 redirect("/admin/tool-orders?refundApproved=1");
}
