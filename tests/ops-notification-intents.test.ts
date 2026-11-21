import {test} from "node:test";
import assert from "node:assert/strict";
import {planOpsNotificationIntents} from "../lib/career/ops-notification-intents";
import type {OpsIncidentAcknowledgment} from "../lib/career/ops-incident-policy";

const openedAt=new Date("2026-11-21T10:00:00.000Z");
const counts={staleReservations:0,uncertainRefunds:2,agedReadyRefunds:0};
const episode:OpsIncidentAcknowledgment={
 key:"REFUND_IN_DOUBT",openedAt,acknowledgedAt:null,lastNotifiedAt:null
};
const instant=(minutes:number)=>new Date(openedAt.getTime()+minutes*60_000);

test("no speculative notification before persisted incident snapshot",()=>{
 assert.deepEqual(planOpsNotificationIntents(counts,[],instant(1)),[]);
});
test("first notification idempotency key is stable even if counts and scan time change",()=>{
 const first=planOpsNotificationIntents(counts,[episode],instant(1));
 const retry=planOpsNotificationIntents({...counts,uncertainRefunds:9},[episode],instant(40));
 assert.equal(first.length,1);assert.equal(retry.length,1);
 assert.equal(first[0].kind,"NOTIFY");
 assert.equal(first[0].priority,"CRITICAL");
 assert.equal(first[0].count,2);
 assert.match(first[0].idempotencyKey,/^[a-f0-9]{64}$/);
 assert.equal(first[0].idempotencyKey,retry[0].idempotencyKey);
 assert.equal(first[0].dueBucket,0);
});
test("sent notifications suppress or escalate by deterministic 15 minute buckets",()=>{
 const notified={...episode,lastNotifiedAt:instant(1)};
 assert.deepEqual(planOpsNotificationIntents(counts,[notified],instant(14)),[]);
 const first=planOpsNotificationIntents(counts,[notified],instant(16));
 const sameBucket=planOpsNotificationIntents(counts,[notified],instant(25));
 const nextBucket=planOpsNotificationIntents(counts,[notified],instant(31));
 assert.equal(first[0].kind,"ESCALATE");
 assert.equal(first[0].dueBucket,1);
 assert.equal(first[0].idempotencyKey,sameBucket[0].idempotencyKey);
 assert.notEqual(first[0].idempotencyKey,nextBucket[0].idempotencyKey);
 assert.equal(nextBucket[0].dueBucket,2);
});
test("acknowledged or resolved incidents cannot create new notification intent",()=>{
 const acknowledged={...episode,acknowledgedAt:instant(4),lastNotifiedAt:instant(1)};
 assert.deepEqual(planOpsNotificationIntents(counts,[acknowledged],instant(80)),[]);
 assert.deepEqual(planOpsNotificationIntents({...counts,uncertainRefunds:0},[episode],instant(80)),[]);
});
test("reopened incident makes a new idempotency key and zero PII fields",()=>{
 const a=planOpsNotificationIntents(counts,[episode],instant(1));
 const reopened={...episode,openedAt:instant(90)};
 const b=planOpsNotificationIntents(counts,[reopened],instant(92));
 assert.equal(a.length,1);assert.equal(b.length,1);
 assert.notEqual(a[0].idempotencyKey,b[0].idempotencyKey);
 assert.deepEqual(Object.keys(b[0]).sort(),[
  "count","dueBucket","idempotencyKey","incidentOpenedAt","key","kind","priority"
 ]);
});
test("rejects invalid scan, duplicate incident, future episode and malformed counts",()=>{
 assert.throws(()=>planOpsNotificationIntents(counts,[episode],new Date("invalid")),/Invalid/);
 assert.throws(()=>planOpsNotificationIntents(counts,[episode,episode],instant(1)),/duplicate/);
 assert.throws(()=>planOpsNotificationIntents(counts,[episode],instant(-1)),/future/);
 assert.throws(()=>planOpsNotificationIntents({...counts,uncertainRefunds:-1},[episode],instant(1)),/count/);
});
