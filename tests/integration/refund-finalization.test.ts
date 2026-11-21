import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {approveRefundIntent} from "../../lib/career/refund-approvals";
import {queueApprovedRefund,claimRefundDispatchOnce} from "../../lib/career/refund-dispatch-outbox";
import {reconcileDispatchedRefund} from "../../lib/career/refund-finalization";
import type {RefundInquiryGateway} from "../../lib/payment/refund-query";
import {available} from "../../lib/career/credits";
import {approvedOpsScanEnvironment,assessOpsAlerts,opsAlertQueryFilters} from "../../lib/career/ops-alert-policy";

test("signed refund inquiry settlement requires confirmed matching refund, atomically revokes unused credits",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable MySQL required");
 const tag=randomUUID();
 const users:string[]=[];
 const create=async(name:string,role:"ADMIN"|"USER"="USER")=>{
  const u=await db.user.create({data:{email:tag+name+"@example.invalid",passwordHash:"test-only",role}});
  users.push(u.id);return u;
 };
 const buyer=await create("-buyer");
 const preparer=await create("-preparer","ADMIN");
 const approver=await create("-approver","ADMIN");
 const dispatcher=await create("-dispatcher","ADMIN");
 const reviewer=await create("-reviewer","ADMIN");
 const outsider=await create("-outsider");
 const priorReal=process.env.ENABLE_REAL_PAYMENT;
 const priorClaim=process.env.ENABLE_REFUND_DISPATCH_CLAIM;
 const priorQuery=process.env.ENABLE_REFUND_QUERY;
 try{
  const order=await reserveToolOrder(buyer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"final-"+tag,amountFen:990});
  const ticket=await requestToolRefund(buyer.id,order.id,"尚未收到使用服务，要求核对后退款，客服已记录申请");
  const intent=await prepareReviewedRefund(ticket.id,preparer.id,"客服已核对全额未使用，并提交独立人员复核");
  await approveRefundIntent(intent.id,approver.id,"独立审核确认账本完整，允许进入内部待派发队列");
  const dispatch=await queueApprovedRefund(intent.id,dispatcher.id);
  let queryCount=0;
  let observed:"UNKNOWN"|"PROCESSING"|"FAILED"|"SUCCEEDED"="UNKNOWN";
  let mismatch=false;
  let changeClaimDuringInquiry=false;
  const gateway:RefundInquiryGateway={
   async query(provider,inquiry){
    queryCount++;
    if(changeClaimDuringInquiry){
     await db.toolRefundDispatch.update({where:{id:dispatch.id},data:{claimantId:outsider.id}});
    }
    assert.equal(provider,"ALIPAY");
    assert.equal(inquiry.providerTradeId,"final-"+tag);
    assert.equal(inquiry.orderId,order.id);
    assert.equal(inquiry.outRefundNo,dispatch.outRefundNo);
    assert.equal(inquiry.originalAmountFen,990);
    assert.equal(inquiry.refundAmountFen,990);
    return {provider,orderId:inquiry.orderId,outRefundNo:inquiry.outRefundNo,
     refundAmountFen:mismatch?991:990,state:observed};
   }
  };
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/IN_DOUBT/);
  process.env.ENABLE_REAL_PAYMENT="true";
  process.env.ENABLE_REFUND_DISPATCH_CLAIM="true";
  await claimRefundDispatchOnce(dispatch.id,dispatcher.id);
  // Simulate a corrupted, claimed refund outbox only in the disposable MySQL.
  const initialFilters=opsAlertQueryFilters(new Date());
  assert.equal(await db.toolRefundDispatch.count({where:{AND:[initialFilters.uncertainRefunds,{id:dispatch.id}]}}),0);
  const originalClaim=await db.toolRefundDispatch.findUniqueOrThrow({
   where:{id:dispatch.id},select:{claimedAt:true}
  });
  assert.ok(originalClaim.claimedAt);
  try{
   await db.toolRefundDispatch.update({where:{id:dispatch.id},data:{claimedAt:null}});
   const filters=opsAlertQueryFilters(new Date());
   assert.equal(await db.toolRefundDispatch.count({
    where:{AND:[filters.uncertainRefunds,{id:dispatch.id}]}
   }),1,"NULL claimedAt must be counted as a refund anomaly");
   const cli=spawnSync(process.execPath,[
    "--conditions=react-server",
    resolve(process.cwd(),"node_modules/tsx/dist/cli.mjs"),
    resolve(process.cwd(),"scripts/ops-alert-scan.ts")
   ],{cwd:process.cwd(),encoding:"utf8",timeout:20_000,env:{
    ...process.env,OPS_ALERT_READ_ONLY_APPROVED:"true",
    INTEGRATION_TEST_DATABASE:"true",NODE_ENV:"test"
   }});
   // The CLI is intentionally restricted to the historical localhost
   // disposable migration DB. CI uses a fresh MySQL "jobs" database and
   // must prove the scan is refused, not bypass the safety boundary.
   const scanEnvironment={
    ...process.env,OPS_ALERT_READ_ONLY_APPROVED:"true",
    INTEGRATION_TEST_DATABASE:"true",NODE_ENV:"test"
   };
   if(approvedOpsScanEnvironment(scanEnvironment)){
    assert.equal(cli.status,2,cli.stderr);
    const report=JSON.parse(cli.stdout) as {
     status:string;counts:{uncertainRefunds:number};alerts:string[]
    };
    assert.equal(report.status,"ALERT");
    assert.ok(report.counts.uncertainRefunds>=1);
    assert.ok(report.alerts.includes("REFUND_IN_DOUBT"));
   }else{
    assert.equal(cli.status,3,"Unsafe scan must fail closed");
    assert.match(cli.stderr,/Operational scan refused/);
    assert.equal(cli.stdout.trim(),"","Rejected scan must not leak aggregate details");
   }
   assert.equal(assessOpsAlerts({
    staleReservations:0,uncertainRefunds:1,agedReadyRefunds:0
   }).status,"ALERT");
   assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
   assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20);
  }finally{
   await db.toolRefundDispatch.update({
    where:{id:dispatch.id},data:{claimedAt:originalClaim.claimedAt}
   });
  }
  assert.equal(await db.toolRefundDispatch.count({
   where:{AND:[opsAlertQueryFilters(new Date()).uncertainRefunds,{id:dispatch.id}]}
  }),0,"restored recent claim must not trigger stale alert");
  // Default live gateway cannot query a real merchant without its own gate/keys.
  delete process.env.ENABLE_REFUND_QUERY;
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id),/disabled/);
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,outsider.id,gateway),/Administrator/);
  mismatch=true;
  observed="SUCCEEDED";
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/mismatch/);
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id}}),0);
  mismatch=false;
  changeClaimDuringInquiry=true;
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/ledger changed/);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  await db.toolRefundDispatch.update({where:{id:dispatch.id},data:{claimantId:dispatcher.id}});
  changeClaimDuringInquiry=false;
  observed="PROCESSING";
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"PROCESSING");
  observed="UNKNOWN";
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"UNKNOWN");
  observed="FAILED";
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"FAILED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20);
  assert.equal((await db.toolRefundDispatch.findUniqueOrThrow({where:{id:dispatch.id}})).state,"IN_DOUBT");
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id}}),3);
  const grant=await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}});
  // Even a signed success must NOT revoke credits if the ledger changed.
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{decrement:1}}});
  observed="SUCCEEDED";
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/ledger changed/);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{increment:1}}});
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"SUCCEEDED");
  const done=await db.toolRefundDispatch.findUniqueOrThrow({where:{id:dispatch.id}});
  assert.equal(done.state,"SUCCEEDED");
  assert.ok(done.confirmedAt);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"REFUNDED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).refundHold,true);
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).status,"SUCCEEDED");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,0);
  assert.equal(await available(buyer.id),0);
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"ALREADY_SUCCEEDED");
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id}}),4);
  const event=await db.toolRefundInquiryEvent.findFirstOrThrow({
   where:{dispatchId:dispatch.id,outcome:"CREDITS_REVOKED"}
  });
  assert.equal(event.operatorId,reviewer.id);
  assert.equal(event.observed,"SUCCEEDED");
  assert.ok(queryCount>=5);
 }finally{
  if(priorReal===undefined)delete process.env.ENABLE_REAL_PAYMENT;
  else process.env.ENABLE_REAL_PAYMENT=priorReal;
  if(priorClaim===undefined)delete process.env.ENABLE_REFUND_DISPATCH_CLAIM;
  else process.env.ENABLE_REFUND_DISPATCH_CLAIM=priorClaim;
  if(priorQuery===undefined)delete process.env.ENABLE_REFUND_QUERY;
  else process.env.ENABLE_REFUND_QUERY=priorQuery;
  await db.toolRefundInquiryEvent.deleteMany({where:{dispatch:{intent:{order:{userId:buyer.id}}}}});
  await db.toolRefundDispatch.deleteMany({where:{intent:{order:{userId:buyer.id}}}});
  await db.toolRefundIntent.deleteMany({where:{order:{userId:buyer.id}}});
  await db.toolRefundCase.deleteMany({where:{userId:buyer.id}});
  await db.toolRun.deleteMany({where:{userId:buyer.id}});
  await db.toolGrant.deleteMany({where:{userId:buyer.id}});
  await db.toolOrder.deleteMany({where:{userId:buyer.id}});
  await db.user.deleteMany({where:{id:{in:users}}});
  await db.$disconnect();
 }
});
