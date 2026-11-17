import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,generateKeyPairSync} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder} from "../../lib/career/billing";
import {reconcileToolOrder} from "../../lib/career/payment-reconciliation";
import {extractAlipaySignedObject} from "../../lib/payment/merchant-gateway";
import type {MerchantGateway} from "../../lib/payment/merchant-gateway";
import {sign,verify} from "../../lib/payment/crypto";

test("merchant reconciliation only settles verified observations and closes confirmed expired orders",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable database required");
 const token=randomUUID();
 const user=await db.user.create({data:{email:token+"@example.invalid",passwordHash:"test-only"}});
 const admin=await db.user.create({data:{email:token+"-admin@example.invalid",passwordHash:"test-only",role:"ADMIN"}});
 try{
  const order=await reserveToolOrder(user.id,"STARTER20","WECHAT");
  let calls=0, closes=0;
  let observations:Awaited<ReturnType<MerchantGateway["query"]>>[]=[{state:"UNPAID"}];
  const gateway:MerchantGateway={
   async query(){calls++;return observations.shift()??{state:"UNKNOWN"};},
   async close(){closes++;}
  };
  assert.equal(await reconcileToolOrder(order.id,admin.id,"CHECK",gateway),"UNPAID");
  assert.equal(closes,0);
  await assert.rejects(reconcileToolOrder(order.id,user.id,"CHECK",gateway));
  await assert.rejects(reconcileToolOrder(order.id,admin.id,"CLOSE_EXPIRED",gateway));
  assert.equal(closes,0);
  // Expired local time alone does not close an order; a failed merchant query leaves it pending.
  await db.toolOrder.update({where:{id:order.id},data:{paymentExpiresAt:new Date(Date.now()-60_000)}});
  observations=[{state:"UNKNOWN"}];
  assert.equal(await reconcileToolOrder(order.id,admin.id,"CLOSE_EXPIRED",gateway),"UNKNOWN");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PENDING");
  observations=[{state:"UNPAID"},{state:"UNPAID"}];
  assert.equal(await reconcileToolOrder(order.id,admin.id,"CLOSE_EXPIRED",gateway),"UNPAID");
  assert.equal(closes,1);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PENDING");
  observations=[{state:"UNPAID"},{state:"CLOSED"}];
  assert.equal(await reconcileToolOrder(order.id,admin.id,"CLOSE_EXPIRED",gateway),"CLOSED");
  const ended=await db.toolOrder.findUniqueOrThrow({where:{id:order.id}});
  assert.equal(ended.status,"CLOSED");assert.equal(ended.activeKey,null);
  assert.equal(await reconcileToolOrder(order.id,admin.id,"CLOSE_EXPIRED",gateway),"UNCHANGED");
  assert.equal(closes,2);
  assert.equal(await db.toolGrant.count({where:{orderId:order.id}}),0);
  const reopened=await reserveToolOrder(user.id,"PRO100","ALIPAY");
  assert.notEqual(reopened.id,order.id);
  const notice={provider:"ALIPAY" as const,orderId:reopened.id,tradeId:"MERCHANT-"+token,amountFen:2990};
  observations=[{state:"PAID",notice:{...notice,amountFen:1}}];
  await assert.rejects(reconcileToolOrder(reopened.id,admin.id,"CHECK",gateway));
  assert.equal(await db.toolGrant.count({where:{orderId:reopened.id}}),0);
  observations=[{state:"PAID",notice}];
  assert.equal(await reconcileToolOrder(reopened.id,admin.id,"CHECK",gateway),"PAID");
  assert.equal(await reconcileToolOrder(reopened.id,admin.id,"CHECK",gateway),"UNCHANGED");
  assert.equal(await db.toolGrant.count({where:{orderId:reopened.id}}),1);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:reopened.id}})).status,"PAID");
  const history=await db.toolOrderReconcileEvent.findMany({where:{orderId:{in:[order.id,reopened.id]}}});
  assert.ok(history.some(h=>h.action==="CLOSE_EXPIRED"&&h.outcome==="CLOSED"));
  assert.ok(history.some(h=>h.action==="CHECK"&&h.outcome==="SETTLED"));
  assert.ok(history.some(h=>h.outcome==="WAITING"||h.outcome==="NEEDS_REVIEW"));
  assert.ok(calls>=5);
 }finally{
  const ids=[user.id,admin.id];
  await db.toolOrderReconcileEvent.deleteMany({where:{operatorId:admin.id}});
  await db.toolRun.deleteMany({where:{userId:user.id}});
  await db.toolGrant.deleteMany({where:{userId:user.id}});
  await db.toolOrder.deleteMany({where:{userId:user.id}});
  await db.user.deleteMany({where:{id:{in:ids}}});
  await db.$disconnect();
 }
});
test("Alipay signed response extraction preserves the original bytes",()=>{
 const signed='{ "code":"10000","msg":"Success","nested":{"path":"https:\\/\\/example.com"} }';
 const raw='{"alipay_trade_query_response":'+signed+',"sign":"placeholder"}';
 assert.equal(extractAlipaySignedObject(raw,"alipay_trade_query_response"),signed);
 const keys=generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{format:"pem",type:"pkcs8"},publicKeyEncoding:{format:"pem",type:"spki"}});
 const signature=sign(signed,keys.privateKey);
 assert.equal(verify(extractAlipaySignedObject(raw,"alipay_trade_query_response"),signature,keys.publicKey),true);
 assert.throws(()=>extractAlipaySignedObject('{"unrelated_response":{}}',"alipay_trade_query_response"));
});
