import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {reserve,finish} from "../../lib/career/credits";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {inspectRefundPreflight} from "../../lib/career/refund-preflight-db";

test("authorized refund preflight sees real grant ledger, active run and request without mutating",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable MySQL required");
 const id=randomUUID();
 const customer=await db.user.create({data:{email:id+"-refund@example.invalid",passwordHash:"test-only"}});
 const other=await db.user.create({data:{email:id+"-other@example.invalid",passwordHash:"test-only"}});
 const admin=await db.user.create({data:{email:id+"-admin@example.invalid",passwordHash:"test-only",role:"ADMIN"}});
 try{
  const order=await reserveToolOrder(customer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"refund-preflight-"+id,amountFen:990});
  await assert.rejects(inspectRefundPreflight(order.id,other.id),/Administrator/);
  const before=await inspectRefundPreflight(order.id,admin.id);
  assert.equal(before.review,"NEEDS_RECONCILIATION");
  assert.ok(before.issues.includes("NOT_FROZEN"));
  assert.ok(before.issues.includes("NO_OPEN_REQUEST"));
  const r=await reserve(customer.id,randomUUID(),"questions");
  assert.equal(r.state,"reserved");
  if(r.state!=="reserved")throw new Error("Missing reservation");
  await requestToolRefund(customer.id,order.id,"用户未收到预期服务，需要客服核查并说明退款政策");
  const pending=await inspectRefundPreflight(order.id,admin.id);
  assert.equal(pending.reservedRuns,1);
  assert.ok(pending.issues.includes("IN_FLIGHT"));
  assert.equal(pending.automaticallyRefundable,false);
  await finish(r.id,true);
  const consumed=await inspectRefundPreflight(order.id,admin.id);
  assert.equal(consumed.reservedRuns,0);
  assert.equal(consumed.succeededRuns,1);
  assert.equal(consumed.remainingCredits,19);
  assert.ok(consumed.issues.includes("CONSUMED_CREDITS"));
  assert.ok(!consumed.issues.includes("LEDGER_MISMATCH"));
  assert.equal((await db.toolRefundCase.count({where:{orderId:order.id,status:"OPEN"}})),1);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,19);
 }finally{
  await db.toolRefundCase.deleteMany({where:{userId:customer.id}});
  await db.toolRun.deleteMany({where:{userId:customer.id}});
  await db.toolGrant.deleteMany({where:{userId:customer.id}});
  await db.toolOrder.deleteMany({where:{userId:customer.id}});
  await db.user.deleteMany({where:{id:{in:[customer.id,other.id,admin.id]}}});
  await db.$disconnect();
 }
});
