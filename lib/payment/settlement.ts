import "server-only";
import {db} from "../db";
import {Prisma} from "@prisma/client";
import {visibleJobs} from "../jobs";
import {createHash} from "node:crypto";
import type {Channel} from "./config";
export type PaymentNotice={provider:Channel;orderId:string;tradeId:string;amountFen:number};

export async function reserveOrder(userId:string,jobId:string,provider:Channel){
  const activeKey=createHash("sha256").update(userId+":"+jobId).digest("hex");
  const job=await db.job.findFirst({where:{id:jobId,...visibleJobs()},select:{priceFen:true}});
  if(!job||job.priceFen<=0)throw new Error("Job unavailable");
  if(await db.unlock.findUnique({where:{userId_jobId:{userId,jobId}}}))throw new Error("Already unlocked");
  const order=await db.order.upsert({where:{activeKey},create:{activeKey,userId,jobId,provider,amountFen:job.priceFen,paymentExpiresAt:new Date(Date.now()+15*60*1000)},update:{}});
  if(order.provider!==provider||order.status!=="PENDING"||order.amountFen!==job.priceFen)throw new Error("Existing order requires reconciliation before retry");
  return order;
}

export async function settlePayment(n:PaymentNotice){
  if(!Number.isSafeInteger(n.amountFen)||n.amountFen<=0||
     !/^[A-Za-z0-9_-]{1,120}$/.test(n.tradeId)||
     (n.provider!=="ALIPAY"&&n.provider!=="WECHAT"))
    throw new Error("Invalid payment notice");
  return db.$transaction(async tx=>{
    const order=await tx.order.findUnique({where:{id:n.orderId}});
    const tradeId=n.provider+":"+n.tradeId;
    if(!order||order.provider!==n.provider||order.amountFen!==n.amountFen)
      throw new Error("Order mismatch");
    if(order.status==="PAID"){
      if(order.providerTradeId!==tradeId)throw new Error("Transaction mismatch");
      return;
    }
    if(order.status!=="PENDING")throw new Error("Order requires reconciliation");

    // Both business flows read the opposite transaction ID unique index under
    // SERIALIZABLE isolation. InnoDB locking reads and gap locks prevent two
    // transactions concurrently settling the same provider reference across
    // the two independent order tables. Any deadlock fails closed.
    if(await tx.toolOrder.findUnique({where:{providerTradeId:tradeId}}))
      throw new Error("Transaction already belongs to AI tool order");

    const updated=await tx.order.updateMany({
      where:{id:order.id,status:"PENDING"},
      data:{status:"PAID",paidAt:new Date(),providerTradeId:tradeId}
    });
    if(updated.count!==1)throw new Error("Concurrent callback; retry");
    await tx.unlock.upsert({
      where:{userId_jobId:{userId:order.userId,jobId:order.jobId}},
      create:{userId:order.userId,jobId:order.jobId,orderId:order.id},
      update:{}
    });
  }, {isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10_000,timeout:15_000});
}
