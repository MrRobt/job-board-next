import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {approveRefundIntent} from "../../lib/career/refund-approvals";
import {queueApprovedRefund,claimRefundDispatchOnce} from "../../lib/career/refund-dispatch-outbox";
import {available,reserve,finish} from "../../lib/career/credits";

test("approved refund dispatch is durably unique and cannot be auto-retried after claim",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable test MySQL required");
 const tag=randomUUID();
 const ids:string[]=[];
 let previousReal=process.env.ENABLE_REAL_PAYMENT;
 let previousClaim=process.env.ENABLE_REFUND_DISPATCH_CLAIM;
 const createUser=async(suffix:string,admin=false)=>{
  const u=await db.user.create({data:{email:tag+suffix+"@example.invalid",passwordHash:"test-only",...(admin?{role:"ADMIN" as const}:{})}});
  ids.push(u.id);return u;
 };
 const buyer=await createUser("-buyer");
 const maker=await createUser("-maker",true);
 const checker=await createUser("-checker",true);
 const dispatcher=await createUser("-dispatcher",true);
 const outsider=await createUser("-outsider");
 try{
  const order=await reserveToolOrder(buyer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"dispatch-"+tag,amountFen:990});
  const ticket=await requestToolRefund(buyer.id,order.id,"没有产生任何 AI 使用记录，现申请全额退款并留档");
  const intent=await prepareReviewedRefund(ticket.id,maker.id,"制单管理员确认金额、冻结状态和用户诉求，请另一名管理员复核");
  await assert.rejects(queueApprovedRefund(intent.id,dispatcher.id),/approval/);
  await approveRefundIntent(intent.id,checker.id,"第二名管理员独立审核原始订单与 AI 权益，无使用，准许进入安全派发队列");
  await assert.rejects(queueApprovedRefund(intent.id,outsider.id),/Administrator/);
  const queued=await queueApprovedRefund(intent.id,dispatcher.id);
  assert.equal(queued.state,"READY");
  assert.equal((await queueApprovedRefund(intent.id,dispatcher.id)).id,queued.id);
  assert.equal(await db.toolRefundDispatch.count({where:{intentId:intent.id}}),1);
  await assert.rejects(claimRefundDispatchOnce(queued.id,dispatcher.id),/disabled/);
  process.env.ENABLE_REAL_PAYMENT="true";
  process.env.ENABLE_REFUND_DISPATCH_CLAIM="true";
  await assert.rejects(claimRefundDispatchOnce(queued.id,outsider.id),/Administrator/);
  await db.toolRefundIntent.update({where:{id:intent.id},data:{reason:"tampered reason"}});
  await assert.rejects(claimRefundDispatchOnce(queued.id,dispatcher.id),/differs|changed/);
  assert.equal((await db.toolRefundDispatch.findUniqueOrThrow({where:{id:queued.id}})).state,"READY");
  await db.toolRefundIntent.update({where:{id:intent.id},data:{reason:intent.reason}});
  const race=await Promise.allSettled([
   claimRefundDispatchOnce(queued.id,dispatcher.id),
   claimRefundDispatchOnce(queued.id,checker.id)
  ]);
  assert.equal(race.filter(x=>x.status==="fulfilled").length,1,"single claimant is required");
  const claimed=await db.toolRefundDispatch.findUniqueOrThrow({where:{id:queued.id}});
  assert.equal(claimed.state,"IN_DOUBT");
  assert.ok(claimed.claimedAt);
  assert.ok([dispatcher.id,checker.id].includes(claimed.claimantId??""));
  await assert.rejects(claimRefundDispatchOnce(queued.id,dispatcher.id),/not retry|Already claimed|inquiry|Dispatch requires/);
  assert.equal(await db.toolRefundDispatch.count({where:{intentId:intent.id}}),1);
  assert.equal((await db.toolRefundIntent.findUniqueOrThrow({where:{id:intent.id}})).state,"APPROVED");
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).status,"PREPARED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).refundHold,true);
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20);
  assert.equal(await available(buyer.id),0);
  // No outbound payment is performed by queue or claim; order and credits remain unchanged.
  const second=await reserveToolOrder(buyer.id,"PRO100","WECHAT");
  await settleToolPayment({provider:"WECHAT",orderId:second.id,tradeId:"dispatch-other-"+tag,amountFen:2990});
  const secondTicket=await requestToolRefund(buyer.id,second.id,"第二张订单需要核验异常使用记录并暂停权益");
  const secondIntent=await prepareReviewedRefund(secondTicket.id,maker.id,"第二张订单制单审核已完成，请求复核后排入安全待发队列");
  await approveRefundIntent(secondIntent.id,checker.id,"第二张订单独立复核已完成，允许安全预留渠道唯一请求号");
  const secondGrant=await db.toolGrant.findUniqueOrThrow({where:{orderId:second.id}});
  await db.toolGrant.update({where:{id:secondGrant.id},data:{remaining:{decrement:1}}});
  await assert.rejects(queueApprovedRefund(secondIntent.id,dispatcher.id),/credit ledger mismatch/);
  assert.equal(await db.toolRefundDispatch.count({where:{intentId:secondIntent.id}}),0);
  await db.toolGrant.update({where:{id:secondGrant.id},data:{remaining:{increment:1}}});
 }finally{
  if(previousReal===undefined)delete process.env.ENABLE_REAL_PAYMENT;
  else process.env.ENABLE_REAL_PAYMENT=previousReal;
  if(previousClaim===undefined)delete process.env.ENABLE_REFUND_DISPATCH_CLAIM;
  else process.env.ENABLE_REFUND_DISPATCH_CLAIM=previousClaim;
  await db.toolRefundDispatch.deleteMany({where:{intent:{order:{userId:buyer.id}}}});
  await db.toolRefundIntent.deleteMany({where:{order:{userId:buyer.id}}});
  await db.toolRefundCase.deleteMany({where:{userId:buyer.id}});
  await db.toolRun.deleteMany({where:{userId:buyer.id}});
  await db.toolGrant.deleteMany({where:{userId:buyer.id}});
  await db.toolOrder.deleteMany({where:{userId:buyer.id}});
  await db.user.deleteMany({where:{id:{in:ids}}});
  await db.$disconnect();
 }
});
