import "server-only";
import {db} from "../db";
import type {Kind} from "./contracts";
export async function trial(userId:string){await db.toolGrant.upsert({where:{trialKey:userId},create:{userId,trialKey:userId,total:1,remaining:1},update:{}});}
export async function available(userId:string){const total=await db.toolGrant.aggregate({where:{userId,OR:[{orderId:null},{order:{status:"PAID",refundHold:false,...(process.env.NODE_ENV==="production"?{provider:{not:"MOCK" as const}}:{})}}]},_sum:{remaining:true}});return total._sum.remaining??0;}
export async function reserve(userId:string,requestId:string,kind:Kind){
 await trial(userId);
 return db.$transaction(async tx=>{
 const prior=await tx.toolRun.findUnique({where:{userId_requestId:{userId,requestId}}});if(prior)return {state:"duplicate" as const};
 const grant=await tx.toolGrant.findFirst({where:{userId,remaining:{gt:0},OR:[{orderId:null},{order:{status:"PAID",refundHold:false,...(process.env.NODE_ENV==="production"?{provider:{not:"MOCK" as const}}:{})}}]},orderBy:[{createdAt:"asc"},{id:"asc"}]});
 if(!grant)return {state:"empty" as const};
 const update=await tx.toolGrant.updateMany({where:{id:grant.id,remaining:{gt:0},OR:[{orderId:null},{order:{status:"PAID",refundHold:false,...(process.env.NODE_ENV==="production"?{provider:{not:"MOCK" as const}}:{})}}]},data:{remaining:{decrement:1}}});
 if(update.count!==1)return {state:"busy" as const};
 const run=await tx.toolRun.create({data:{userId,grantId:grant.id,requestId,kind}});
 return {state:"reserved" as const,id:run.id};
 });
}
export async function finish(id:string,success:boolean){return db.$transaction(async tx=>{
 const run=await tx.toolRun.findUniqueOrThrow({where:{id}});
 const result=await tx.toolRun.updateMany({where:{id,status:"RESERVED"},data:{status:success?"SUCCEEDED":"FAILED",finishedAt:new Date()}});
 if(result.count===1&&!success)await tx.toolGrant.update({where:{id:run.grantId},data:{remaining:{increment:1}}});
 return result.count===1;
 });}
