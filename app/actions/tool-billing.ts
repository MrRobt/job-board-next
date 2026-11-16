"use server";
import {requireUser} from "@/lib/auth";
import {db} from "@/lib/db";
import {redirect} from "next/navigation";
import {z} from "zod";
import {allowAttempt} from "@/lib/rate-limit";
import {toolPaymentEnabled,toolMockEnabled} from "@/lib/career/billing-config";
import {reserveToolOrder,mockToolOrder} from "@/lib/career/billing";
import {createWechatUrl} from "@/lib/payment/wechat";
export async function purchaseTool(sku:string,form:FormData){
 const user=await requireUser();const channel=z.enum(["ALIPAY","WECHAT","MOCK"]).safeParse(form.get("provider"));
 if(!channel.success||!await allowAttempt("purchase-tool",user.id,10,60))redirect("/pricing?error=1");
 const mode=channel.data;let id:string;
 try{
 if(mode==="MOCK"){if(!toolMockEnabled())throw new Error("Mock disabled");const request=z.string().uuid().parse(form.get("requestId"));id=(await mockToolOrder(user.id,sku,request)).id;}
 else{if(!toolPaymentEnabled(mode))throw new Error("Payment disabled");const order=await reserveToolOrder(user.id,sku,mode);id=order.id;if(mode==="WECHAT"&&!order.codeUrl){const url=await createWechatUrl({...order,tool:true});await db.toolOrder.updateMany({where:{id,status:"PENDING",codeUrl:null},data:{codeUrl:url}});}}
 }catch{redirect("/pricing?error=1");}
 redirect("/tool-pay/"+id);
}
