import {test} from "node:test";
import assert from "node:assert/strict";
import {opsIncidentOutcomeNotice} from "../lib/career/ops-incident-notice";

test("incident GET parameters never claim acknowledgment succeeded",()=>{
 assert.equal(opsIncidentOutcomeNotice(undefined),null);
 assert.equal(opsIncidentOutcomeNotice(""),null);
 const forged=[
  "ACKNOWLEDGED","ALREADY_ACKNOWLEDGED","FAILED","anything"
 ];
 for(const value of forged){
  const notice=opsIncidentOutcomeNotice(value);
  assert.ok(notice);
  assert.match(notice,/不代表确认已成功/);
  assert.match(notice,/审计记录/);
  assert.doesNotMatch(notice,/确认已记录|原确认已存在/);
 }
 assert.equal(opsIncidentOutcomeNotice(["ACKNOWLEDGED"]),null);
});
