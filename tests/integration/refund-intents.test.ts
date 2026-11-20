import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund,rejectToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {reserve,finish,available} from "../../lib/career/credits";

test("refund preparation persists immutable idempotent intent without moving money",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Only isolated test database");
 const tag=randomUUID();
 const customer=await db.user.create({data:{email:tag+"-customer@example.invalid",passwordHash:"test-only"}});
 const other=await db.user.create({data:{email:tag+"-other@example.invalid",passwordHash:"test-only"}});
 const admin=await db.user.create({data:{email:tag+"-admin@example.invalid",passwordHash:"test-only",role:"ADMIN"}});
 try{
  const order=await reserveToolOrder(customer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"prepare-"+tag,amountFen:990});
  const ticket=await requestToolRefund(customer.id,order.id,"用户反馈服务未满足预期，申请人工核实退款条件");
  const reason="管理员已核对无使用记录，准备受控退款请求，不发起支付渠道操作";
  await assert.rejects(prepareReviewedRefund(ticket.id,other.id,reason),/Administrator/);
  const initial=await db.toolRefundIntent.count({where:{orderId:order.id}});
  assert.equal(initial,0);
  const first=await prepareReviewedRefund(ticket.id,admin.id,reason);
  assert.equal(first.state,"PREPARED");
  assert.match(first.outRefundNo,/^R[a-f0-9]{30}$/);
  assert.match(first.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(first.amountFen,990);
  assert.equal((await prepareReviewedRefund(ticket.id,admin.id,reason)).id,first.id);
  await assert.rejects(prepareReviewedRefund(ticket.id,admin.id,reason+"（改动）"),/conflicts/);
  await assert.rejects(rejectToolRefund(admin.id,ticket.id,"该退款已准备但应被拒绝"),/Request already handled/);
  assert.equal(await db.toolRefundIntent.count({where:{orderId:order.id}}),1);
  const liveOrder=await db.toolOrder.findUniqueOrThrow({where:{id:order.id}});
  const liveCase=await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}});
  assert.equal(liveOrder.status,"PAID","preparation cannot mark refunded");
  assert.equal(liveOrder.refundHold,true,"entitlement stays frozen");
  assert.equal(liveCase.status,"PREPARED");
  assert.equal(liveCase.reviewerId,admin.id);
  assert.equal(await available(customer.id),0,"no credits become spendable");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20);
  // A separate order with one delivered AI call must be refused for full refund preparation.
  const used=await reserveToolOrder(customer.id,"PRO100","WECHAT");
  await settleToolPayment({provider:"WECHAT",orderId:used.id,tradeId:"prepare-used-"+tag,amountFen:2990});
  const run=await reserve(customer.id,randomUUID(),"questions");
  assert.equal(run.state,"reserved");
  if(run.state!=="reserved")throw new Error("Unable to reserve credit");
  assert.equal(await finish(run.id,true),true);
  const usedTicket=await requestToolRefund(customer.id,used.id,"部分服务已经实际使用，仍需客服人工核实退款情况");
  await assert.rejects(prepareReviewedRefund(usedTicket.id,admin.id,reason),/manual reconciliation/);
  assert.equal(await db.toolRefundIntent.count({where:{orderId:used.id}}),0);
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:usedTicket.id}})).status,"OPEN");
 }finally{
  await db.toolRefundIntent.deleteMany({where:{order:{userId:customer.id}}});
  await db.toolRefundCase.deleteMany({where:{userId:customer.id}});
  await db.toolRun.deleteMany({where:{userId:customer.id}});
  await db.toolGrant.deleteMany({where:{userId:customer.id}});
  await db.toolOrder.deleteMany({where:{userId:customer.id}});
  await db.user.deleteMany({where:{id:{in:[customer.id,other.id,admin.id]}}});
  await db.$disconnect();
 }
});
