import {test} from "node:test";
import assert from "node:assert/strict";
import {reviewGates,parseDeletionReviewForm} from "../lib/account-deletion-review-event-policy";

test("U01 deletion audit writes are default-off and require explicit operator enablement",()=>{
 assert.deepEqual(reviewGates({}),{canRecord:false});
 assert.equal(reviewGates({ENABLE_ACCOUNT_DELETION_REVIEW_WRITE:"false"}).canRecord,false);
 assert.equal(reviewGates({ENABLE_ACCOUNT_DELETION_REVIEW_WRITE:"true"}).canRecord,true);
 assert.equal(reviewGates({ENABLE_ACCOUNT_DELETION_REVIEW_WRITE:"TRUE"}).canRecord,false);
});
test("U01 audit events accept only fixed reason code, one application ID and explicit confirmation",()=>{
 const form=new FormData();
 form.set("requestId","clx"+ "a".repeat(22));
 form.set("reasonCode","NEEDS_PRIVACY_REVIEW");
 form.set("confirmed","yes");
 form.set("$ACTION_ID_a1b2c3",""); // Next.js form protocol metadata, not an operator-supplied field
 assert.deepEqual(parseDeletionReviewForm(form),{
  requestId:"clx"+"a".repeat(22),reasonCode:"NEEDS_PRIVACY_REVIEW"
 });
 for(const reason of ["FINANCIAL_HOLD_RECORDED","NEEDS_OFFLINE_VERIFICATION"]){
  form.set("reasonCode",reason);
  assert.equal(parseDeletionReviewForm(form).reasonCode,reason);
 }
 form.set("reasonCode","APPROVED_DELETE");
 assert.throws(()=>parseDeletionReviewForm(form));
 form.set("reasonCode","NEEDS_PRIVACY_REVIEW");
 form.append("requestId","clx"+"b".repeat(22));
 assert.throws(()=>parseDeletionReviewForm(form));
});
test("U01 review notes cannot be used to smuggle free text or session/operator identifiers",()=>{
 const f=new FormData();
 f.set("requestId","clx"+"a".repeat(22));
 f.set("reasonCode","NEEDS_PRIVACY_REVIEW");
 f.set("confirmed","yes");
 for(const key of ["note","operatorId","userId","status","delete","refund"]){
  f.set(key,"attacker-input");
  assert.throws(()=>parseDeletionReviewForm(f),key);
  f.delete(key);
 }
 f.set("confirmed","false");
 assert.throws(()=>parseDeletionReviewForm(f));
 f.set("confirmed","yes");
 f.set("requestId","../etc/passwd");
 assert.throws(()=>parseDeletionReviewForm(f));
});
