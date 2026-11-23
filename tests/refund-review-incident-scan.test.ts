import {test} from "node:test";
import assert from "node:assert/strict";
import {runIsolatedRefundReviewIncidentScan,approvedRefundReviewIncidentSyncEnvironment} from "../lib/career/refund-review-incident-scan";
import {transitionOpsIncident} from "../lib/career/ops-incident-state";
import type {OpsIncidentSyncStore} from "../lib/career/ops-incident-sync-service";
import type {OpsIncidentSnapshot} from "../lib/career/ops-incident-state";
import {parseOpsAckForm} from "../lib/career/ops-ack-form";
import {toOpsIncidentView} from "../lib/career/ops-incident-view";
import {buildOpsNotificationEnvelope} from "../lib/career/ops-notification-envelope";
import {queueInitialOpsNotificationIntent} from "../lib/career/ops-notification-queue";
import {opsNotificationIdempotencyKey} from "../lib/career/ops-notification-intents";

const now=new Date("2026-11-24T02:00:00.000Z");
const approved={OPS_ALERT_READ_ONLY_APPROVED:"true",OPS_INCIDENT_SYNC_APPROVED:"true",
 OPS_REFUND_LEDGER_SYNC_APPROVED:"true",INTEGRATION_TEST_DATABASE:"true",NODE_ENV:"test",
 DATABASE_URL:"mysql://synthetic@127.0.0.1:3306/jobs_mvp_migrate_20261124_refund"};
function fixture(){
 let current:OpsIncidentSnapshot|null=null;
 const events:string[]=[];
 const store:OpsIncidentSyncStore={transaction:async work=>{
  const before=current&&{...current},length=events.length;
  try{return await work({
   async read(key){return current?.key===key?{...current}:null;},
   async create(next){if(current)throw Error("unique conflict");current={...next};},
   async compareAndUpdate(previous,next){
    if(!current||current.key!==previous.key||current.openedAt.getTime()!==previous.openedAt.getTime()||
     current.state!==previous.state||current.count!==previous.count||
     current.lastSeenAt.getTime()!==previous.lastSeenAt.getTime())return 0;
    current={...next};return 1;
   },
   async append(row){events.push(row.action);}
  });}catch(e){current=before;events.length=length;throw e;}
 }};
 return {store,read:()=>current,events};
}
test("B04 signed-success refund review is a separate durable incident; no synthetic refund changes",async()=>{
 const f=fixture(),reader={readActiveHolds:async()=>2};
 assert.equal((await runIsolatedRefundReviewIncidentScan(approved,reader,f.store,now)).event,"OPENED");
 assert.equal(f.read()?.key,"REFUND_LEDGER_REVIEW");
 assert.equal(f.read()?.state,"OPEN");
 assert.equal(f.read()?.count,2);
 assert.equal((await runIsolatedRefundReviewIncidentScan(approved,reader,f.store,
  new Date(now.getTime()+1000))).event,null);
 assert.equal((await runIsolatedRefundReviewIncidentScan(approved,{readActiveHolds:async()=>0},
  f.store,new Date(now.getTime()+2000))).event,"RESOLVED");
 assert.equal(f.read()?.state,"RESOLVED");
 assert.equal((await runIsolatedRefundReviewIncidentScan(approved,{readActiveHolds:async()=>1},
  f.store,new Date(now.getTime()+3000))).event,"REOPENED");
 assert.deepEqual(f.events,["OPENED","RESOLVED","REOPENED"]);
 assert.equal(f.read()?.acknowledgedAt,null);
 assert.equal(f.read()?.acknowledgedById,null);
 assert.equal(transitionOpsIncident("REFUND_LEDGER_REVIEW",null,1,now).event,"OPENED");
});
test("B04 refund review incident sync needs THREE independent explicit isolated approvals",async()=>{
 assert.equal(approvedRefundReviewIncidentSyncEnvironment(approved),true);
 for(const overrides of [
  {OPS_REFUND_LEDGER_SYNC_APPROVED:"false"},
  {OPS_INCIDENT_SYNC_APPROVED:"false"},
  {OPS_ALERT_READ_ONLY_APPROVED:"false"},
  {NODE_ENV:"production"},
  {INTEGRATION_TEST_DATABASE:"false"},
  {DATABASE_URL:"mysql://synthetic@127.0.0.1:3306/jobs"}
 ]){
  const f=fixture(),env={...approved,...overrides};
  assert.equal(approvedRefundReviewIncidentSyncEnvironment(env),false);
  await assert.rejects(runIsolatedRefundReviewIncidentScan(env,{
   readActiveHolds:async()=>{throw Error("should never query");}
  },f.store,now),/refused/);
  assert.equal(f.read(),null);
  assert.deepEqual(f.events,[]);
 }
});
test("B04 invalid or failed count never silently resolves an active manual review",async()=>{
 const f=fixture();
 await runIsolatedRefundReviewIncidentScan(approved,{readActiveHolds:async()=>1},f.store,now);
 for(const n of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  await assert.rejects(runIsolatedRefundReviewIncidentScan(approved,{
   readActiveHolds:async()=>n
  },f.store,new Date(now.getTime()+1000)),/Invalid/);
 }
 await assert.rejects(runIsolatedRefundReviewIncidentScan(approved,{
  readActiveHolds:async():Promise<number>=>{throw Error("database missing");}
 },f.store,new Date(now.getTime()+2000)),/database missing/);
 assert.equal(f.read()?.state,"OPEN");
 assert.deepEqual(f.events,["OPENED"]);
});
test("B04 new incident supports admin form and isolated display but NEVER queues an external message",async()=>{
 const f=fixture();
 await runIsolatedRefundReviewIncidentScan(approved,{readActiveHolds:async()=>1},f.store,now);
 const snapshot=f.read()!;
 const view=toOpsIncidentView(snapshot);
 assert.equal(view.key,"REFUND_LEDGER_REVIEW");
 assert.equal(view.priority,"CRITICAL");
 assert.match(view.label,/退款/);
 const form=new FormData();
 form.set("key","REFUND_LEDGER_REVIEW");
 form.set("expectedOpenedAt",now.toISOString());
 form.set("confirmed","yes");
 form.set("reason","已核对真实退款成功与权益冻结差异，人工接手继续核查账本");
 assert.equal(parseOpsAckForm(form).key,"REFUND_LEDGER_REVIEW");
 const key=opsNotificationIdempotencyKey("REFUND_LEDGER_REVIEW",now,"NOTIFY",0);
 assert.throws(()=>buildOpsNotificationEnvelope({idempotencyKey:key,
  key:"REFUND_LEDGER_REVIEW",kind:"NOTIFY",priority:"CRITICAL",count:1,
  incidentOpenedAt:now,dueBucket:0}),/not approved/);
 let touched=false;
 await assert.rejects(queueInitialOpsNotificationIntent({transaction:async()=>{
  touched=true;throw Error("Unexpected queue access");
 }},{idempotencyKey:key,key:"REFUND_LEDGER_REVIEW",kind:"NOTIFY",
  priority:"CRITICAL",count:1,incidentOpenedAt:now,dueBucket:0},
 now),/not approved/);
 assert.equal(touched,false,"New refund incident cannot stage external delivery");
});
