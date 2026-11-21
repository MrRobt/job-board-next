import {test} from "node:test";
import assert from "node:assert/strict";
import {planOpsIncidents,type OpsIncidentAcknowledgment} from "../lib/career/ops-incident-policy";

const at=new Date("2026-11-21T10:00:00.000Z");

test("unchanged active categories have stable identities and no new notification",()=>{
 const first=planOpsIncidents({staleReservations:1,uncertainRefunds:2,agedReadyRefunds:0},[],at);
 assert.equal(first.length,2);
 assert.deepEqual(first.map(x=>x.key),["STALE_AI_RESERVATIONS","REFUND_IN_DOUBT"]);
 assert.equal(first[1].priority,"CRITICAL");
 assert.equal(first[1].action,"NOTIFY");
 const after=planOpsIncidents({staleReservations:5,uncertainRefunds:2,agedReadyRefunds:0},
  first.map(x=>({key:x.key,openedAt:at,acknowledgedAt:null,lastNotifiedAt:at})),
  new Date(at.getTime()+5*60_000));
 assert.deepEqual(after.map(x=>x.action),["SUPPRESS","SUPPRESS"]);
 assert.equal(after[1].count,2);
});

test("unacknowledged critical incident escalates after 15 minutes, noncritical after 30",()=>{
 const prior:OpsIncidentAcknowledgment[]=[
  {key:"REFUND_IN_DOUBT",openedAt:at,acknowledgedAt:null,lastNotifiedAt:at},
  {key:"STALE_AI_RESERVATIONS",openedAt:at,acknowledgedAt:null,lastNotifiedAt:at}
 ];
 const before=planOpsIncidents({staleReservations:1,uncertainRefunds:1,agedReadyRefunds:0},prior,
  new Date(at.getTime()+14*60_000));
 assert.deepEqual(before.map(x=>x.action),["SUPPRESS","SUPPRESS"]);
 const after=planOpsIncidents({staleReservations:1,uncertainRefunds:1,agedReadyRefunds:0},prior,
  new Date(at.getTime()+16*60_000));
 assert.deepEqual(after.map(x=>x.action),["SUPPRESS","ESCALATE"]);
 const later=planOpsIncidents({staleReservations:1,uncertainRefunds:1,agedReadyRefunds:0},prior,
  new Date(at.getTime()+31*60_000));
 assert.deepEqual(later.map(x=>x.action),["ESCALATE","ESCALATE"]);
});

test("acknowledged incident suppresses duplicates; resolved items are not emitted",()=>{
 const prior:OpsIncidentAcknowledgment[]=[
  {key:"REFUND_IN_DOUBT",openedAt:at,acknowledgedAt:new Date(at.getTime()+60_000),lastNotifiedAt:at},
  {key:"REFUND_READY_AGED",openedAt:at,acknowledgedAt:null,lastNotifiedAt:at}
 ];
 assert.deepEqual(planOpsIncidents({staleReservations:0,uncertainRefunds:2,agedReadyRefunds:0},
  prior,new Date(at.getTime()+70*60_000)).map(x=>x.action),["ACKNOWLEDGED"]);
});

test("invalid, future or inconsistent incident records fail closed",()=>{
 const counts={staleReservations:0,uncertainRefunds:1,agedReadyRefunds:0};
 assert.throws(()=>planOpsIncidents(counts,[],new Date("invalid")),/scan time/);
 assert.throws(()=>planOpsIncidents({...counts,uncertainRefunds:-1},[],at),/count/);
 const base={key:"REFUND_IN_DOUBT" as const,openedAt:at,acknowledgedAt:null,lastNotifiedAt:at};
 assert.throws(()=>planOpsIncidents(counts,[base,base],at),/duplicate/);
 assert.throws(()=>planOpsIncidents(counts,[{...base,openedAt:new Date(at.getTime()+1000)}],at),/future/);
 assert.throws(()=>planOpsIncidents(counts,[{...base,lastNotifiedAt:new Date(at.getTime()-1000)}],at),/before/);
 assert.throws(()=>planOpsIncidents(counts,[{...base,acknowledgedAt:new Date(at.getTime()-1000)}],at),/before/);
});
