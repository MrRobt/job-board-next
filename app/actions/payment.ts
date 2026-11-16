"use server";
import {db} from "@/lib/db";
import {requireUser} from "@/lib/auth";
import {visibleJobs} from "@/lib/jobs";
import {mockPaymentEnabled} from "@/lib/payment/mock";
import {redirect} from "next/navigation";
import {enabled,type Channel} from "@/lib/payment/config";
import {reserveOrder} from "@/lib/payment/settlement";
import {revalidatePath} from "next/cache";
export async function mockPurchase(id:string){if(!mockPaymentEnabled()||process.env.ENABLE_REAL_PAYMENT==="true")throw new Error("Payment unavailable");const user=await requireUser();
try{await db.$transaction(async tx=>{const job=await tx.job.findFirst({where:{id,...visibleJobs()},select:{priceFen:true}});if(!job||job.priceFen<=0)throw new Error("Job is unavailable");const existing=await tx.unlock.findUnique({where:{userId_jobId:{userId:user.id,jobId:id}}});if(existing)return;const order=await tx.order.create({data:{userId:user.id,jobId:id,amountFen:job.priceFen,provider:"MOCK",status:"PAID",paidAt:new Date()}});await tx.unlock.create({data:{userId:user.id,jobId:id,orderId:order.id}});});}catch(e){const existing=await db.unlock.findUnique({where:{userId_jobId:{userId:user.id,jobId:id}}});if(!existing)throw e;}
revalidatePath("/jobs/"+id);revalidatePath("/account");redirect("/jobs/"+id);}

export async function startPurchase(id:string,channel:Channel){
 if(!["ALIPAY","WECHAT"].includes(channel)||!enabled(channel))throw new Error("Payment unavailable");
 const user=await requireUser();
 let orderId:string;
 try{orderId=(await reserveOrder(user.id,id,channel)).id;}catch{redirect("/checkout/"+id+"?error=1");}
 redirect("/pay/"+orderId);
}
