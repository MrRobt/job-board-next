import {test} from "node:test";
import assert from "node:assert/strict";
import {toOpsIncidentView} from "../lib/career/ops-incident-view";
import type {OpsIncidentSnapshot} from "../lib/career/ops-incident-state";
const openedAt=new Date("2026-11-21T09:00:00.000Z");
const record:OpsIncidentSnapshot={
 key:"REFUND_IN_DOUBT",state:"OPEN",count:2,
 openedAt,lastSeenAt:openedAt,acknowledgedAt:null,
 acknowledgedById:null,acknowledgmentNote:null,resolvedAt:null
};
test("admin incident panel only displays non-sensitive projection",()=>{
 const actual=toOpsIncidentView(record);
 assert.deepEqual(actual,{
  key:"REFUND_IN_DOUBT",label:"退款状态待核实",priority:"CRITICAL",
  state:"OPEN",count:2,openedAt,lastSeenAt:openedAt,acknowledgedAt:null
 });
 assert.equal("acknowledgmentNote" in actual,false);
 assert.equal("acknowledgedById" in actual,false);
 assert.equal("resolvedAt" in actual,false);
});
test("operations panel view refuses corrupted counts, keys, and timestamps",()=>{
 for(const invalid of [
  {...record,count:-1},{...record,count:1.2},
  {...record,key:"UNKNOWN"},
  {...record,lastSeenAt:new Date(openedAt.getTime()-1000)},
  {...record,openedAt:new Date("invalid")},
  {...record,acknowledgedAt:new Date("invalid")}
 ]){
  assert.throws(()=>toOpsIncidentView(invalid as OpsIncidentSnapshot));
 }
});
test("resolved and acknowledged incident projections retain meaningful state",()=>{
 assert.equal(toOpsIncidentView({...record,state:"ACKNOWLEDGED",
  acknowledgedAt:openedAt}).state,"ACKNOWLEDGED");
 assert.equal(toOpsIncidentView({...record,key:"STALE_AI_RESERVATIONS"}).priority,"HIGH");
});
