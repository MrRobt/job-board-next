import "server-only";
import {db} from "../db";
import {settleToolPayment} from "./billing";
import {env,type Channel} from "../payment/config";
import {liveGateway,type MerchantGateway} from "../payment/merchant-gateway";
import type {MerchantObservation} from "../payment/merchant-observation";

export type ReconcileAction="CHECK"|"CLOSE_EXPIRED";
export type ReconcileResult="PAID"|"CLOSED"|"UNPAID"|"UNKNOWN"|"UNCHANGED"|"CONFLICT";

const merchantKeys:Record<Channel,string[]>={
 ALIPAY:["ALIPAY_APP_ID","ALIPAY_SELLER_ID","ALIPAY_PRIVATE_KEY","ALIPAY_PUBLIC_KEY"],
 WECHAT:["WECHAT_APP_ID","WECHAT_MCH_ID","WECHAT_MERCHANT_SERIAL","WECHAT_PRIVATE_KEY","WECHAT_PAY_PUBLIC_KEY_ID","WECHAT_PAY_PUBLIC_KEY"]
};
export function reconciliationEnabled(provider:Channel){
 if(process.env.ENABLE_PAYMENT_RECONCILIATION!=="true")return false;
 try{merchantKeys[provider].forEach(env);return true;}catch{return false;}
}
function observationMatches(observation:MerchantObservation,orderId:string,provider:Channel){
 if(observation.state==="PAID"&&(observation.notice.orderId!==orderId||observation.notice.provider!==provider)){
  throw new Error("Merchant observation does not match local order");
 }
}
export async function reconcileToolOrder(
 orderId:string,
 operatorId:string,
 action:ReconcileAction,
 gateway:MerchantGateway=liveGateway
):Promise<ReconcileResult>{
 if(!/^T[a-f0-9]{30}$/.test(orderId))throw new Error("Invalid order identifier");
 if(action!=="CHECK"&&action!=="CLOSE_EXPIRED")throw new Error("Unknown reconciliation operation");
 const operator=await db.user.findUnique({where:{id:operatorId},select:{role:true}});
 if(operator?.role!=="ADMIN")throw new Error("Administrator required");
 const order=await db.toolOrder.findUnique({where:{id:orderId}});
 if(!order||order.provider==="MOCK")throw new Error("Cannot reconcile this order");
 if(order.status!=="PENDING")return "UNCHANGED";
 if(gateway===liveGateway&&!reconciliationEnabled(order.provider))throw new Error("Merchant reconciliation disabled");
 if(action==="CLOSE_EXPIRED"&&(!order.paymentExpiresAt||order.paymentExpiresAt>new Date()))throw new Error("Order has not expired");

 let observed=await gateway.query(order.id,order.provider);
 observationMatches(observed,order.id,order.provider);
 if(action==="CLOSE_EXPIRED"&&observed.state==="UNPAID"){
  // Only a verified provider-side close followed by a *second* verified query
  // can release the active order key. Network or provider errors leave PENDING.
  await gateway.close(order.id,order.provider);
  observed=await gateway.query(order.id,order.provider);
  observationMatches(observed,order.id,order.provider);
 }

 const state=observed.state;
 if(state==="PAID"){
  await settleToolPayment(observed.notice);
  await db.toolOrderReconcileEvent.create({
   data:{orderId:order.id,operatorId,action,observed:state,outcome:"SETTLED"}
  });
  return "PAID";
 }
 if(state==="CLOSED"){
  const closed=await db.$transaction(async tx=>{
   const updated=await tx.toolOrder.updateMany({
    where:{id:order.id,status:"PENDING"},
    data:{status:"CLOSED",activeKey:null,codeUrl:null}
   });
   await tx.toolOrderReconcileEvent.create({
    data:{orderId:order.id,operatorId,action,observed:state,outcome:updated.count===1?"CLOSED":"CONFLICT"}
   });
   return updated.count===1;
  });
  return closed?"CLOSED":"CONFLICT";
 }
 await db.toolOrderReconcileEvent.create({
  data:{orderId:order.id,operatorId,action,observed:state,outcome:state==="UNPAID"?"WAITING":"NEEDS_REVIEW"}
 });
 return state==="UNPAID"?"UNPAID":"UNKNOWN";
}
