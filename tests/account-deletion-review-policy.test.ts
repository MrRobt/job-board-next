import {test} from "node:test";
import assert from "node:assert/strict";
import {assessDeletionReviewExposure} from "../lib/account-deletion-review-policy";

const clear={realToolOrders:0,pendingToolOrders:0,legacyOrders:0,refundCases:0,
 refundIntents:0,refundDispatches:0,reservedRuns:0,activeGrants:0,applications:0};
test("U01 even zero observed exposure requires manual privacy review",()=>{
 const result=assessDeletionReviewExposure(clear);
 assert.equal(result.disposition,"MANUAL_REVIEW");
 assert.deepEqual(result.reasons,[]);
 assert.equal(result.canAutoDelete,false);
});
test("U01 real financial/refund data always forces manual financial hold",()=>{
 for(const key of ["realToolOrders","pendingToolOrders","legacyOrders","refundCases","refundIntents","refundDispatches"] as const){
  const result=assessDeletionReviewExposure({...clear,[key]:1});
  assert.equal(result.disposition,"FINANCIAL_HOLD",key);
  assert.equal(result.canAutoDelete,false);
  assert.ok(result.reasons.length>0);
 }
});
test("U01 in-flight calls and unused credits prevent automatic disposition",()=>{
 for(const key of ["reservedRuns","activeGrants"] as const){
  const result=assessDeletionReviewExposure({...clear,[key]:1});
  assert.equal(result.disposition,"OPERATIONAL_HOLD");
  assert.equal(result.canAutoDelete,false);
 }
 assert.equal(assessDeletionReviewExposure({...clear,applications:2}).disposition,"MANUAL_REVIEW");
});
test("U01 invalid and missing financial evidence fail closed",()=>{
 assert.equal(assessDeletionReviewExposure({...clear,realToolOrders:-1}).disposition,"EVIDENCE_UNAVAILABLE");
 assert.equal(assessDeletionReviewExposure({...clear,refundCases:Number.NaN}).disposition,"EVIDENCE_UNAVAILABLE");
 assert.equal(assessDeletionReviewExposure({...clear,refundIntents:1.2}).disposition,"EVIDENCE_UNAVAILABLE");
 const incomplete={...clear} as Record<string,number>;
 delete incomplete.refundDispatches;
 assert.equal(assessDeletionReviewExposure(incomplete as typeof clear).disposition,"EVIDENCE_UNAVAILABLE");
});
