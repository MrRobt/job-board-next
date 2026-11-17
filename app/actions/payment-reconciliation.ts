"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/auth";
import {reconcileToolOrder} from "@/lib/career/payment-reconciliation";

export async function reconcilePayment(orderId:string,form:FormData){
 const admin=await requireAdmin();
 const action=form.get("action");
 if(action!=="CHECK"&&action!=="CLOSE_EXPIRED")redirect("/admin/tool-orders?paymentError=1");
 if(action==="CLOSE_EXPIRED"&&form.get("confirmed")!=="yes")redirect("/admin/tool-orders?paymentError=1");
 let result:string;
 try{
  result=await reconcileToolOrder(orderId,admin.id,action);
 }catch{
  redirect("/admin/tool-orders?paymentError=1");
 }
 revalidatePath("/admin/tool-orders");
 revalidatePath("/account");
 redirect("/admin/tool-orders?paymentResult="+result);
}
