import {test} from "node:test";
import assert from "node:assert/strict";
import {opsIncidentGates} from "../lib/career/ops-incident-gates";

test("ops incident flags fail closed by default and on near-miss values",()=>{
 assert.deepEqual(opsIncidentGates({}),{canRead:false,canAcknowledge:false});
 for(const value of ["TRUE","1","yes","true "," true","false",""]){
  assert.deepEqual(opsIncidentGates({
   ENABLE_OPS_INCIDENT_READ:value,ENABLE_OPS_INCIDENT_ACK:value
  }),{canRead:false,canAcknowledge:false});
 }
});
test("read-only incident access does not authorize acknowledgment",()=>{
 assert.deepEqual(opsIncidentGates({ENABLE_OPS_INCIDENT_READ:"true"}),
  {canRead:true,canAcknowledge:false});
});
test("acknowledgment implies read visibility, even without a separate read flag",()=>{
 assert.deepEqual(opsIncidentGates({ENABLE_OPS_INCIDENT_ACK:"true"}),
  {canRead:true,canAcknowledge:true});
 assert.deepEqual(opsIncidentGates({
  ENABLE_OPS_INCIDENT_READ:"true",ENABLE_OPS_INCIDENT_ACK:"true"
 }),{canRead:true,canAcknowledge:true});
});
