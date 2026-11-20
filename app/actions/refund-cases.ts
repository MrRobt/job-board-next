"use server";
import {z} from "zod";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireUser,requireAdmin} from "@/lib/auth";
import {allowAttempt} from "@/lib/rate-limit";
import {requestToolRefund,rejectToolRefund} from "@/lib/career/refund-cases";

export async function submitRefundCase(orderId:string,form:FormData){
 const user=await requireUser();
 const reason=z.string().trim().min(10).max(500).safeParse(form.get("reason"));
 if(!reason.success||!await allowAttempt("request-refund",user.id,5,60)){
  redirect("/account?refundError=1");
 }
 try{await requestToolRefund(user.id,orderId,reason.data);}
 catch{redirect("/account?refundError=1");}
 revalidatePath("/account");revalidatePath("/admin/tool-orders");
 redirect("/account?refundRequested=1");
}
export async function rejectRefundCase(caseId:string,form:FormData){
 const admin=await requireAdmin();
 const reason=z.string().trim().min(10).max(500).safeParse(form.get("reason"));
 if(!reason.success||form.get("confirmed")!=="yes")redirect("/admin/tool-orders?refundError=1");
 try{await rejectToolRefund(admin.id,caseId,reason.data);}
 catch{redirect("/admin/tool-orders?refundError=1");}
 revalidatePath("/account");revalidatePath("/admin/tool-orders");
 redirect("/admin/tool-orders?refundRejected=1");
}
