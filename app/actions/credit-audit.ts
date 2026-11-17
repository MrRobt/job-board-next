"use server";
import {z} from "zod";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/auth";
import {refundStaleReservation} from "@/lib/career/reconcile";

export async function confirmCreditRefund(id:string,form:FormData){
 const admin=await requireAdmin();
 const reason=z.string().trim().min(10).max(500).safeParse(form.get("reason"));
 if(form.get("confirmed")!=="yes"||!reason.success){
  redirect("/admin/tool-orders?error=1");
 }
 try{
  await refundStaleReservation(id,admin.id,reason.data);
 }catch{
  redirect("/admin/tool-orders?error=1");
 }
 revalidatePath("/admin/tool-orders");
 revalidatePath("/account");
 redirect("/admin/tool-orders?ok=1");
}
