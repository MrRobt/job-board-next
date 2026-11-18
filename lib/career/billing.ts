import "server-only";
import {randomBytes,createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {db} from "../db";
import type {Channel} from "../payment/config";
import type {PaymentNotice} from "../payment/settlement";
import {product} from "./catalog";
const orderId=()=> "T"+randomBytes(15).toString("hex");

export async function reserveToolOrder(userId:string,sku:string,provider:Channel){
  const item=product(sku);if(!item)throw new Error("Unknown product");
  const activeKey=createHash("sha256").update("tool:"+userId).digest("hex");
  const order=await db.toolOrder.upsert({where:{activeKey},create:{id:orderId(),userId,sku,amountFen:item.amountFen,credits:item.credits,provider,activeKey,paymentExpiresAt:new Date(Date.now()+15*60000)},update:{}});
  if(order.userId!==userId||order.sku!==sku||order.provider!==provider||order.status!=="PENDING"||!order.paymentExpiresAt||order.paymentExpiresAt<=new Date())throw new Error("Existing pending order requires reconciliation");
  return order;
}

export async function settleToolPayment(n:PaymentNotice){
  if(!/^T[a-f0-9]{30}$/.test(n.orderId)||!Number.isSafeInteger(n.amountFen)||
     n.amountFen<=0||!/^[A-Za-z0-9_-]{1,120}$/.test(n.tradeId)||
     (n.provider!=="ALIPAY"&&n.provider!=="WECHAT"))
    throw new Error("Invalid notice");
  return db.$transaction(async tx=>{
    const order=await tx.toolOrder.findUnique({where:{id:n.orderId}});
    const tradeId=n.provider+":"+n.tradeId;
    if(!order||order.provider!==n.provider||order.amountFen!==n.amountFen)
      throw new Error("Order mismatch");
    if(order.status==="PAID"){
      if(order.providerTradeId!==tradeId)throw new Error("Transaction mismatch");
      return;
    }
    if(order.status!=="PENDING")throw new Error("Reconcile manually");
    // Match the legacy path's SERIALIZABLE locking read. Either transaction
    // encountering an already spent trade or a MySQL deadlock must fail closed.
    if(await tx.order.findUnique({where:{providerTradeId:tradeId}}))
      throw new Error("Transaction already belongs to legacy order");
    const changed=await tx.toolOrder.updateMany({
      where:{id:order.id,status:"PENDING"},
      data:{status:"PAID",providerTradeId:tradeId,activeKey:null,paidAt:new Date()}
    });
    if(changed.count!==1)throw new Error("Concurrent notification; retry");
    await tx.toolGrant.create({
      data:{userId:order.userId,orderId:order.id,total:order.credits,remaining:order.credits}
    });
  }, {isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10_000,timeout:15_000});
}

export async function mockToolOrder(userId:string,sku:string,requestId:string){
  const item=product(sku);if(!item)throw new Error("Unknown product");
  const key=createHash("sha256").update("mock:"+userId+":"+requestId).digest("hex");const id="M"+key.slice(0,30);
  return db.$transaction(async tx=>{
    const order=await tx.toolOrder.upsert({where:{id},create:{id,userId,sku,amountFen:item.amountFen,credits:item.credits,provider:"MOCK",status:"PAID",paidAt:new Date()},update:{}});
    if(order.userId!==userId||order.sku!==sku||order.provider!=="MOCK"||order.status!=="PAID")throw new Error("Request mismatch");
    await tx.toolGrant.upsert({where:{orderId:order.id},create:{userId,orderId:order.id,total:item.credits,remaining:item.credits},update:{}});
    return order;
  });
}
