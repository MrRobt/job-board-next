import {test} from "node:test";
import assert from "node:assert/strict";
import {transitionOpsIncident} from "../lib/career/ops-incident-state";

const now=new Date("2026-11-21T12:00:00.000Z");
const base={key:"REFUND_IN_DOUBT" as const,state:"OPEN" as const,
 count:2,openedAt:new Date(now.getTime()-60_000),lastSeenAt:new Date(now.getTime()-60_000),
 acknowledgedAt:null,acknowledgedById:null,acknowledgmentNote:null,resolvedAt:null};

test("new incident opens once; repeated active count changes are not audit events",()=>{
 const first=transitionOpsIncident("REFUND_IN_DOUBT",null,2,now);
 assert.equal(first.event,"OPENED");
 assert.ok(first.next);
 assert.equal(first.next.state,"OPEN");
 assert.equal(first.next.count,2);
 assert.equal(transitionOpsIncident("REFUND_IN_DOUBT",first.next,3,
  new Date(now.getTime()+1000)).event,null);
});

test("resolved and reappearing refund starts a new unacknowledged episode",()=>{
 const resolved=transitionOpsIncident("REFUND_IN_DOUBT",base,0,now);
 assert.ok(resolved.next);
 assert.equal(resolved.next.state,"RESOLVED");
 assert.equal(resolved.event,"RESOLVED");
 const reopened=transitionOpsIncident("REFUND_IN_DOUBT",{
  ...resolved.next,acknowledgedAt:base.openedAt,acknowledgedById:"admin",
  acknowledgmentNote:"approved old event"
 },1,new Date(now.getTime()+1000));
 assert.ok(reopened.next);
 assert.equal(reopened.next.state,"OPEN");
 assert.equal(reopened.next.acknowledgedAt,null);
 assert.equal(reopened.next.acknowledgedById,null);
 assert.equal(reopened.next.acknowledgmentNote,null);
 assert.equal(reopened.event,"REOPENED");
});

test("acknowledged active incident remains acknowledged until resolved",()=>{
 const ack={...base,state:"ACKNOWLEDGED" as const,acknowledgedAt:base.openedAt,
  acknowledgedById:"admin",acknowledgmentNote:"operator confirmed case"};
 const stillActive=transitionOpsIncident("REFUND_IN_DOUBT",ack,3,now);
 assert.ok(stillActive.next);
 assert.equal(stillActive.next.state,"ACKNOWLEDGED");
 const completed=transitionOpsIncident("REFUND_IN_DOUBT",ack,0,now);
 assert.ok(completed.next);
 assert.equal(completed.next.state,"RESOLVED");
});

test("invalid clock, missing incident and stale timestamps fail closed",()=>{
 assert.throws(()=>transitionOpsIncident("REFUND_IN_DOUBT",base,-1,now),/count/);
 assert.throws(()=>transitionOpsIncident("REFUND_IN_DOUBT",base,1,new Date("bad")) ,/time/);
 assert.throws(()=>transitionOpsIncident("REFUND_IN_DOUBT",base,1,
  new Date(base.openedAt.getTime()-1000)),/stale/);
 assert.throws(()=>transitionOpsIncident("REFUND_READY_AGED",base,1,now),/category/);
 for(const key of ["UNAPPROVED_REFUND_ACTION","",null,42]){
  assert.throws(()=>transitionOpsIncident(key as never,null,1,now),/Invalid incident key/);
 }
});
