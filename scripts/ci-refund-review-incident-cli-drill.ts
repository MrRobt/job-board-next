/** B04 real CLI verification on an ephemeral CI MySQL 8 database only.
 * Synthetic data. No outbound payment/refund/AI provider requests.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {db} from "../lib/db";
import {reserveToolOrder,settleToolPayment} from "../lib/career/billing";
import {requestToolRefund} from "../lib/career/refund-cases";
import {prepareReviewedRefund} from "../lib/career/refund-intents";
import {approveRefundIntent} from "../lib/career/refund-approvals";
import {queueApprovedRefund} from "../lib/career/refund-dispatch-outbox";
import {reconcileDispatchedRefund} from "../lib/career/refund-finalization";
import {acknowledgeOpsIncidentWithStore} from "../lib/career/ops-incident-acknowledgment-service";
import {createPrismaOpsIncidentStore,type OpsPrismaClientPort} from "../lib/career/ops-incident-prisma-store";
import {countRefundLedgerReviewHolds} from "../lib/career/refund-review-ops-read";
import type {RefundInquiryGateway} from "../lib/payment/refund-query";
const key="REFUND_LEDGER_REVIEW" as const;
const cli=resolve(process.cwd(),"scripts/refund-review-incident-scan.ts");

function assertDisposable(){
 const u=new URL(process.env.DATABASE_URL??"");
 if(process.env.CI!=="true"||process.env.NODE_ENV==="production"||
    process.env.INTEGRATION_TEST_DATABASE!=="true"||u.protocol!=="mysql:"||
    u.hostname!=="127.0.0.1"||u.port!=="3306"||
    u.pathname!=="/jobs_mvp_migrate_20261124_b04ci"||u.search||u.hash||
    process.env.ENABLE_REAL_PAYMENT!=="false"||
    process.env.ENABLE_REFUND_SEND!=="false"||
    process.env.ENABLE_LIVE_AI!=="false")
  throw Error("CI drill only permits dedicated disposable MySQL without external channels");
}
function scan(allowed=true){
 const r=spawnSync(process.execPath,["--conditions=react-server","--import","tsx",cli],{
  cwd:process.cwd(),encoding:"utf8",timeout:30000,
  env:{...process.env,OPS_ALERT_READ_ONLY_APPROVED:"true",
   OPS_INCIDENT_SYNC_APPROVED:"true",
   OPS_REFUND_LEDGER_SYNC_APPROVED:allowed?"true":"false"}
 });
 if(!allowed){
  assert.equal(r.status,3,r.stderr);
  assert.equal(r.stdout.trim(),"");
  assert.match(r.stderr,/refused/);
  return null;
 }
 assert.ok(r.status===0||r.status===2,r.stderr);
 const v=JSON.parse(r.stdout.trim()) as {task:string;state:string;event:string|null;
  count:number;key:string;externalNotification:boolean;financialMutation:boolean};
 assert.equal(v.task,"B04_REFUND_LEDGER_REVIEW_INCIDENT_SYNC");
 assert.equal(v.key,key);
 assert.equal(v.externalNotification,false);
 assert.equal(v.financialMutation,false);
 assert.equal(r.status,v.count>0?2:0);
 return v;
}
test("B04 actual CLI on disposable MySQL: OPEN/ACK/RESOLVED, replay safe, money untouched",async()=>{
 assertDisposable();
 assert.equal(await db.opsAlertIncident.count({where:{key}}),0);
 assert.equal(await countRefundLedgerReviewHolds(db),0);
 const marker=randomUUID(),ids:string[]=[];let buyerId="";
 const person=async(label:string,role:"ADMIN"|"USER"="USER")=>{
  const u=await db.user.create({data:{
   email:"b04-review-"+marker+label+"@example.invalid",
   passwordHash:"[REDACTED_SECRET]",role
  }});
  ids.push(u.id);return u;
 };
 try{
  scan(false);
  assert.equal(scan()?.state,"ABSENT");
  const buyer=await person("buyer");buyerId=buyer.id;
  const maker=await person("maker","ADMIN"),checker=await person("checker","ADMIN");
  const claimer=await person("claimer","ADMIN"),reviewer=await person("reviewer","ADMIN");
  const order=await reserveToolOrder(buyer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"synthetic-"+marker,amountFen:990});
  const request=await requestToolRefund(buyer.id,order.id,
   "Synthetic unused paid credit bundle refund requiring manual review");
  const intent=await prepareReviewedRefund(request.id,maker.id,
   "Reviewed synthetic order, amount and full unused grant for internal reconciliation");
  await approveRefundIntent(intent.id,checker.id,
   "Independent synthetic approval; no real merchant refund is authorised");
  const dispatch=await queueApprovedRefund(intent.id,claimer.id);
  await db.toolRefundDispatch.update({where:{id:dispatch.id},data:{
   state:"IN_DOUBT",claimantId:claimer.id,claimedAt:new Date()
  }});
  const grant=await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}});
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{decrement:1}}});
  const gateway:RefundInquiryGateway={async query(provider,inquiry){
   assert.equal(provider,"ALIPAY");
   assert.equal(inquiry.orderId,order.id);
   assert.equal(inquiry.outRefundNo,dispatch.outRefundNo);
   assert.equal(inquiry.refundAmountFen,990);
   return {provider,orderId:inquiry.orderId,outRefundNo:inquiry.outRefundNo,
    refundAmountFen:990,state:"SUCCEEDED" as const};
  }};
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/manual ledger review/);
  assert.equal(await countRefundLedgerReviewHolds(db),1);
  assert.equal(scan()?.event,"OPENED");
  assert.equal(scan()?.event,null);
  assert.equal(await db.opsAlertIncidentEvent.count({where:{incidentKey:key,action:"OPENED"}}),1);
  const incident=await db.opsAlertIncident.findUniqueOrThrow({where:{key}});
  const ack=createPrismaOpsIncidentStore(db as unknown as OpsPrismaClientPort);
  assert.equal(await acknowledgeOpsIncidentWithStore(ack,{
   key,expectedOpenedAt:incident.openedAt,operatorId:reviewer.id,
   reason:"已检查合成商户退款成功与权益账本冲突，明确人工接手核对"
  },new Date()),"ACKNOWLEDGED");
  assert.equal(scan()?.state,"ACKNOWLEDGED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{id:grant.id}})).remaining,19);
  assert.equal((await db.toolRefundDispatch.findUniqueOrThrow({where:{id:dispatch.id}})).state,"IN_DOUBT");
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{increment:1}}});
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"SUCCEEDED");
  assert.equal(scan()?.event,"RESOLVED");
  assert.equal(scan()?.event,null);
  assert.equal((await db.opsAlertIncident.findUniqueOrThrow({where:{key}})).state,"RESOLVED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"REFUNDED");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{id:grant.id}})).remaining,0);
  assert.equal(await db.toolRefundInquiryEvent.count({where:{
   dispatchId:dispatch.id,outcome:"MANUAL_LEDGER_REVIEW"}}),1);
  assert.deepEqual((await db.opsAlertIncidentEvent.findMany({
   where:{incidentKey:key},orderBy:{createdAt:"asc"},select:{action:true}
  })).map(x=>x.action),["OPENED","ACKNOWLEDGED","RESOLVED"]);
  console.log(JSON.stringify({task:"B04_REFUND_REVIEW_CLI_MYSQL8",
   status:"PASS",steps:12,externalCalls:0,noAutoRefund:true}));
 }finally{
  await db.opsIncidentNotificationIntent.deleteMany({where:{incidentKey:key}});
  await db.opsAlertIncidentEvent.deleteMany({where:{incidentKey:key}});
  await db.opsAlertIncident.deleteMany({where:{key}});
  if(buyerId){
   await db.toolRefundInquiryEvent.deleteMany({where:{dispatch:{intent:{order:{userId:buyerId}}}}});
   await db.toolRefundDispatch.deleteMany({where:{intent:{order:{userId:buyerId}}}});
   await db.toolRefundIntent.deleteMany({where:{order:{userId:buyerId}}});
   await db.toolRefundCase.deleteMany({where:{userId:buyerId}});
   await db.toolRun.deleteMany({where:{userId:buyerId}});
   await db.toolGrant.deleteMany({where:{userId:buyerId}});
   await db.toolOrder.deleteMany({where:{userId:buyerId}});
  }
  if(ids.length)await db.user.deleteMany({where:{id:{in:ids}}});
  await db.$disconnect();
 }
});
