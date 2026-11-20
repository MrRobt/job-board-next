import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {approveRefundIntent} from "../../lib/career/refund-approvals";
import {available} from "../../lib/career/credits";

test("second independent admin approval is durable and never sends money or unfreezes credits",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable test MySQL required");
 const id=randomUUID();
 const user=await db.user.create({data:{email:id+"-buyer@example.invalid",passwordHash:"test-only"}});
 const maker=await db.user.create({data:{email:id+"-maker@example.invalid",passwordHash:"test-only",role:"ADMIN"}});
 const checker=await db.user.create({data:{email:id+"-checker@example.invalid",passwordHash:"test-only",role:"ADMIN"}});
 const outsider=await db.user.create({data:{email:id+"-outsider@example.invalid",passwordHash:"test-only"}});
 try {
  const order=await reserveToolOrder(user.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"approval-"+id,amountFen:990});
  const ticket=await requestToolRefund(user.id,order.id,"退款原因用户沟通已完成，等待独立人工复核确认");
  const intent=await prepareReviewedRefund(ticket.id,maker.id,"管理员核验全额未使用且无在途请求，准备内部退款记录");
  const reason="第二名管理员再次确认交易、次数、工单及冻结状态符合审批要求";
  await assert.rejects(approveRefundIntent(intent.id,maker.id,reason),/Independent/);
  await assert.rejects(approveRefundIntent(intent.id,outsider.id,reason),/Administrator/);
  await assert.rejects(approveRefundIntent(intent.id,checker.id,"太短"),/reason/);
  assert.equal((await db.toolRefundIntent.findUniqueOrThrow({where:{id:intent.id}})).state,"PREPARED");

  // A corrupted or concurrently consumed credit balance must prevent approval.
  const grant=await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}});
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{decrement:1}}});
  await assert.rejects(approveRefundIntent(intent.id,checker.id,reason),/entitlement/);
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{increment:1}}});

  const approved=await approveRefundIntent(intent.id,checker.id,reason);
  assert.equal(approved.state,"APPROVED");
  assert.equal(approved.approvedById,checker.id);
  assert.equal(approved.approvalReason,reason);
  assert.ok(approved.approvedAt);
  assert.equal((await approveRefundIntent(intent.id,checker.id,reason)).id,approved.id);
  await assert.rejects(approveRefundIntent(intent.id,checker.id,reason+"篡改"),/different/);
  await assert.rejects(approveRefundIntent(intent.id,maker.id,reason),/Independent/);

  const finalOrder=await db.toolOrder.findUniqueOrThrow({where:{id:order.id}});
  assert.equal(finalOrder.status,"PAID","internal approval is NOT a successful merchant refund");
  assert.equal(finalOrder.refundHold,true,"entitlement stays frozen");
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).status,"PREPARED");
  assert.equal(await available(user.id),0,"no extra credits");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20);

  // A new approval should refuse a stale order, not blindly trust a prepared record.
  const order2=await reserveToolOrder(user.id,"PRO100","WECHAT");
  await settleToolPayment({provider:"WECHAT",orderId:order2.id,tradeId:"approval2-"+id,amountFen:2990});
  const case2=await requestToolRefund(user.id,order2.id,"申请完整退款且尚未使用次数，等待财务核对结果");
  const prepared2=await prepareReviewedRefund(case2.id,maker.id,"已核对用户数据及支付记录，准备第二笔内部意图");
  await db.toolOrder.update({where:{id:order2.id},data:{refundHold:false}});
  await assert.rejects(approveRefundIntent(prepared2.id,checker.id,reason),/not safely frozen/);
  assert.equal((await db.toolRefundIntent.findUniqueOrThrow({where:{id:prepared2.id}})).state,"PREPARED");
 }finally{
  await db.toolRefundIntent.deleteMany({where:{order:{userId:user.id}}});
  await db.toolRefundCase.deleteMany({where:{userId:user.id}});
  await db.toolRun.deleteMany({where:{userId:user.id}});
  await db.toolGrant.deleteMany({where:{userId:user.id}});
  await db.toolOrder.deleteMany({where:{userId:user.id}});
  await db.user.deleteMany({where:{id:{in:[user.id,maker.id,checker.id,outsider.id]}}});
  await db.$disconnect();
 }
});
