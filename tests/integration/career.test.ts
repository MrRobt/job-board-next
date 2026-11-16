import {test} from "node:test";import assert from "node:assert/strict";import {randomUUID} from "node:crypto";import {db} from "../../lib/db";import {trial,available,reserve,finish} from "../../lib/career/credits";import {reserveToolOrder,settleToolPayment,mockToolOrder} from "../../lib/career/billing";
test("trial, duplicate request, failure restoration, paid entitlement and account isolation",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Use disposable database only");
 const tag=randomUUID();let a="",b="";
 try{
 a=(await db.user.create({data:{email:tag+"-a@example.invalid",passwordHash:"test-only"}})).id;
 b=(await db.user.create({data:{email:tag+"-b@example.invalid",passwordHash:"test-only"}})).id;
 await trial(a);await trial(a);assert.equal(await available(a),1);assert.equal(await available(b),0);
 const request=randomUUID(),first=await reserve(a,request,"resume");assert.equal(first.state,"reserved");if(first.state!=="reserved")throw new Error("Expected reservation");
 assert.equal(await available(a),0);assert.equal((await reserve(a,request,"resume")).state,"duplicate");assert.equal((await reserve(a,randomUUID(),"resume")).state,"empty");
 assert.equal(await finish(first.id,false),true);assert.equal(await finish(first.id,false),false);assert.equal(await available(a),1);
 const next=await reserve(a,randomUUID(),"feedback");if(next.state!=="reserved")throw new Error("Expected reservation");await finish(next.id,true);assert.equal(await available(a),0);
 const order=await reserveToolOrder(a,"STARTER20","ALIPAY");assert.equal((await reserveToolOrder(a,"STARTER20","ALIPAY")).id,order.id);await assert.rejects(reserveToolOrder(a,"STARTER20","WECHAT"));await assert.rejects(reserveToolOrder(a,"PRO100","ALIPAY"));
 const notice={provider:"ALIPAY" as const,orderId:order.id,tradeId:tag,amountFen:990};await assert.rejects(settleToolPayment({...notice,amountFen:1}));await assert.rejects(settleToolPayment({...notice,provider:"WECHAT"}));assert.equal(await available(a),0);
 await settleToolPayment(notice);await settleToolPayment(notice);assert.equal(await available(a),20);assert.equal(await available(b),0);await assert.rejects(settleToolPayment({...notice,tradeId:tag+"-other"}));assert.equal(await db.toolGrant.count({where:{orderId:order.id}}),1);assert.equal(await db.unlock.count({where:{userId:a}}),0);
 const used=await reserve(a,randomUUID(),"questions");if(used.state!=="reserved")throw new Error("Expected paid reservation");await finish(used.id,true);assert.equal(await available(a),19);
 await db.toolOrder.update({where:{id:order.id},data:{status:"REFUNDED"}});assert.equal(await available(a),0);
 const mockId=randomUUID(),mock=await mockToolOrder(b,"PRO100",mockId);assert.equal(mock.id,(await mockToolOrder(b,"PRO100",mockId)).id);assert.equal(await db.toolGrant.count({where:{orderId:mock.id}}),1);
 }finally{const ids=[a,b].filter(Boolean);if(ids.length){await db.toolRun.deleteMany({where:{userId:{in:ids}}});await db.toolGrant.deleteMany({where:{userId:{in:ids}}});await db.toolOrder.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});}await db.$disconnect();}
});