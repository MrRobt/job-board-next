import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {prepareOpsNotificationHandoff as prepare,type OpsNotificationHandoffIntent,
  type OpsNotificationHandoffIncident,type OpsNotificationHandoffStore} from "../lib/career/ops-notification-handoff";
import {createPrismaOpsNotificationHandoffStore} from "../lib/career/ops-notification-handoff-prisma-store";
import {opsNotificationIdempotencyKey} from "../lib/career/ops-notification-intents";

const openedAt=new Date("2026-11-22T00:00:00Z");
const now=new Date("2026-11-22T00:01:00Z");
const key=opsNotificationIdempotencyKey("REFUND_IN_DOUBT",openedAt,"NOTIFY",0);
const token=randomUUID();
const intent:OpsNotificationHandoffIntent={
  idempotencyKey:key,incidentKey:"REFUND_IN_DOUBT",episodeOpenedAt:openedAt,
  state:"CLAIMED",claimToken:token,leaseExpiresAt:new Date(now.getTime()+60_000),
  attemptCount:1,kind:"NOTIFY",priority:"CRITICAL",count:2,dueBucket:0
};
const incident:OpsNotificationHandoffIncident={state:"OPEN",openedAt,count:4};
const request={key,claimToken:token,now,enabled:"true",operatorApproved:"true",
  destination:"https://alerts.example.org",
  approvedOrigins:["https://alerts.example.org"]};
function fakeStore(i:OpsNotificationHandoffIntent|null=intent,
  alert:OpsNotificationHandoffIncident|null=incident){
  let transactions=0,incidentReads=0;
  const store:OpsNotificationHandoffStore={transaction:async cb=>{
    transactions++;
    return cb({readIntent:async()=>i,readIncident:async()=>{incidentReads++;return alert}});
  }};
  return {store,transactions:()=>transactions,incidentReads:()=>incidentReads};
}

test("handoff binds approved destination to current persisted episode and sanitized count",async()=>{
  const db=fakeStore();
  const result=await prepare(db.store,request);
  assert.equal(result.status,"PREPARED");
  if(result.status!=="PREPARED")throw Error("Unexpected result");
  assert.equal(result.destination,request.destination);
  assert.equal(result.envelope.idempotencyKey,key);
  assert.equal(result.envelope.count,4);
  assert.deepEqual(Object.keys(result.envelope),[
    "schemaVersion","idempotencyKey","incident","kind","priority","count",
    "episodeOpenedAt","dueBucket"
  ]);
  assert.equal(db.transactions(),1);
  assert.equal(db.incidentReads(),1);
});

test("disabled and unapproved target fail before database reads",async()=>{
  for(const change of [
    {enabled:undefined},{operatorApproved:undefined},
    {destination:"https://alerts.example.org.evil.net"},
    {destination:"http://alerts.example.org"}
  ]){
    const db=fakeStore();
    assert.deepEqual(await prepare(db.store,{...request,...change}),{status:"DENIED"});
    assert.equal(db.transactions(),0);
  }
});

test("stale and invalid lease, tokens, incidents and episodes fail closed",async()=>{
  for(const [i,alert,status,reads] of [
    [null,incident,"MISSING",0],
    [{...intent,claimToken:randomUUID()},incident,"FENCED",0],
    [{...intent,state:"QUEUED"},incident,"FENCED",0],
    [{...intent,leaseExpiresAt:now},incident,"EXPIRED",0],
    [intent,{...incident,state:"ACKNOWLEDGED"},"STALE",1],
    [intent,{...incident,state:"RESOLVED"},"STALE",1],
    [intent,{...incident,count:0},"STALE",1],
    [intent,{...incident,openedAt:new Date(now.getTime())},"STALE",1],
    [{...intent,episodeOpenedAt:new Date(now.getTime()+1000)},
      {...incident,openedAt:new Date(now.getTime()+1000)},"STALE",1],
    [intent,null,"STALE",1]
  ] as const){
    const db=fakeStore(i,alert);
    assert.equal((await prepare(db.store,request)).status,status);
    assert.equal(db.incidentReads(),reads);
  }
  for(const i of [
    {...intent,idempotencyKey:"b".repeat(64)},
    {...intent,incidentKey:"INVALID"},
    {...intent,dueBucket:1},
    {...intent,priority:"HIGH"},
    {...intent,count:0},
    {...intent,attemptCount:6}
  ])await assert.rejects(prepare(fakeStore(i).store,request),/Invalid|Inconsistent/);
});

test("malformed requests and database failure never produce a prepared handoff",async()=>{
  for(const change of [
    {key:"bad"},{claimToken:"bad"},{now:new Date(NaN)}
  ])await assert.rejects(prepare(fakeStore().store,{...request,...change}),/Invalid/);
  const broken:OpsNotificationHandoffStore={transaction:async()=>{throw Error("DATABASE_UNAVAILABLE")}};
  await assert.rejects(prepare(broken,request),/DATABASE_UNAVAILABLE/);
});

test("Prisma adapter reads only explicit fields in Serializable transaction",async()=>{
  let calls=0;
  const store=createPrismaOpsNotificationHandoffStore({
    $transaction:async(fn,opts)=>{
      calls++;
      assert.equal(opts.isolationLevel,"Serializable");
      return fn({
        opsIncidentNotificationIntent:{findUnique:async args=>{
          assert.deepEqual(args.where,{idempotencyKey:key});
          assert.equal(args.select.kind,true);
          assert.equal(args.select.dueBucket,true);
          assert.equal(Object.hasOwn(args.select,"failureCode"),false);
          return intent;
        }},
        opsAlertIncident:{findUnique:async args=>{
          assert.deepEqual(args.select,{state:true,openedAt:true,count:true});
          return incident;
        }}
      });
    }
  });
  assert.equal((await prepare(store,request)).status,"PREPARED");
  assert.equal(calls,1);
});
