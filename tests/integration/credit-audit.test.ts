import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {trial,reserve,finish,available} from "../../lib/career/credits";
import {staleCreditReservations} from "../../lib/career/audit";
import {refundStaleReservation} from "../../lib/career/reconcile";

test("manual stale AI credit refund is authorized, audited and idempotent",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable test DB required");
 const tag=randomUUID();
 const user=await db.user.create({data:{email:tag+"@example.invalid",passwordHash:"test-only"}});
 const admin=await db.user.create({data:{email:tag+"-admin@example.invalid",passwordHash:"test-only",role:"ADMIN"}});
 try{
  await trial(user.id);
  const r=await reserve(user.id,randomUUID(),"resume");
  assert.equal(r.state,"reserved");
  if(r.state!=="reserved")throw new Error("Reservation missing");
  const reason="确认模型请求异常终止，用户未收到分析报告，管理员核对后返还一次";
  await assert.rejects(refundStaleReservation(r.id,admin.id,reason),"recent run must not be refunded");
  const old=new Date(Date.now()-20*60_000);
  await db.toolRun.update({where:{id:r.id},data:{createdAt:old}});
  const audit=await staleCreditReservations();
  assert.ok(audit.rows.some(x=>x.id===r.id&&x.user.email===user.email));
  assert.equal(await available(user.id),0,"audit must not grant credits");
  await assert.rejects(refundStaleReservation(r.id,user.id,reason),"ordinary user must not refund");
  await assert.rejects(refundStaleReservation(r.id,admin.id,"不够长"),"reason is mandatory");
  await refundStaleReservation(r.id,admin.id,reason);
  assert.equal(await available(user.id),1);
  assert.equal((await db.toolRun.findUniqueOrThrow({where:{id:r.id}})).status,"FAILED");
  const record=await db.toolRunAdjustment.findUniqueOrThrow({where:{runId:r.id}});
  assert.equal(record.operatorId,admin.id);assert.equal(record.reason,reason);
  await assert.rejects(refundStaleReservation(r.id,admin.id,reason),"no double refund");
  assert.equal(await finish(r.id,false),false);
  assert.equal(await available(user.id),1);
  const after=await staleCreditReservations();
  assert.ok(!after.rows.some(x=>x.id===r.id));
 }finally{
  await db.toolRunAdjustment.deleteMany({where:{operatorId:admin.id}});
  await db.toolRun.deleteMany({where:{userId:user.id}});
  await db.toolGrant.deleteMany({where:{userId:user.id}});
  await db.user.deleteMany({where:{id:{in:[user.id,admin.id]}}});
  await db.$disconnect();
 }
});
