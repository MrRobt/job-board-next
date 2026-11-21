import {test} from "node:test";
import assert from "node:assert/strict";
import {deadNotificationReviewGates,isTrustedDeadReviewOrigin,parseDeadReviewForm} from "../lib/career/ops-dead-review-web";
const key="e".repeat(64);
const form=()=>{
 const f=new FormData();
 f.set("confirmed","yes");f.set("key",key);f.set("reasonCode","REVIEWED_NO_REQUEUE");
 return f;
};
test("review flags default off and require both exact flags for writes",()=>{
 assert.deepEqual(deadNotificationReviewGates({}),{canRead:false,canReview:false});
 for(const value of ["TRUE","yes","1","true "," false",""]){
  assert.deepEqual(deadNotificationReviewGates({ENABLE_OPS_DEAD_REVIEW_READ:value,ENABLE_OPS_DEAD_REVIEW_WRITE:value}),{canRead:false,canReview:false});
 }
 assert.deepEqual(deadNotificationReviewGates({ENABLE_OPS_DEAD_REVIEW_WRITE:"true"}),{canRead:false,canReview:false});
 assert.deepEqual(deadNotificationReviewGates({ENABLE_OPS_DEAD_REVIEW_READ:"true"}),{canRead:true,canReview:false});
 assert.deepEqual(deadNotificationReviewGates({ENABLE_OPS_DEAD_REVIEW_READ:"true",ENABLE_OPS_DEAD_REVIEW_WRITE:"true"}),{canRead:true,canReview:true});
});
test("strict same-origin check rejects absent, cross-site and malformed origin",()=>{
 assert.equal(isTrustedDeadReviewOrigin("https://ops.example.com","ops.example.com"),true);
 assert.equal(isTrustedDeadReviewOrigin("http://localhost:3000","localhost:3000"),true);
 for(const [origin,host] of [
  [null,"ops.example.com"],["https://ops.example.com",null],
  ["https://evil.example.com","ops.example.com"],
  ["https://ops.example.com.evil.test","ops.example.com"],
  ["https://ops.example.com/path","ops.example.com"],
  ["https://ops.example.com/?x=y","ops.example.com"],
  ["https://ops.example.com#x","ops.example.com"],
  ["https://user:pass@ops.example.com","ops.example.com"],
  ["file://ops.example.com","ops.example.com"],
  ["https://ops.example.com","ops.example.com:444"],
  ["https://ops.example.com","ops.example.com@evil.test"]
 ] as const) assert.equal(isTrustedDeadReviewOrigin(origin,host),false);
});
test("review form accepts only whitelisted decisions and explicit single confirmation",()=>{
 assert.deepEqual(parseDeadReviewForm(form()),{key,reasonCode:"REVIEWED_NO_REQUEUE"});
 const f=form();f.set("operatorId","malicious");f.set("role","ADMIN");
 assert.deepEqual(parseDeadReviewForm(f),{key,reasonCode:"REVIEWED_NO_REQUEUE"});
 for(const reason of ["SEND_NOW","RETRY","APPROVED","note with@example.com","", "REVIEWED_NO_REQUEUE "]){
  const v=form();v.set("reasonCode",reason);
  assert.throws(()=>parseDeadReviewForm(v),/Invalid/);
 }
 for(const name of ["key","reasonCode","confirmed"]){
  const v=form();v.append(name,"yes");
  assert.throws(()=>parseDeadReviewForm(v),/duplicate/);
 }
 for(const name of ["key","reasonCode","confirmed"]){
  const v=form();v.delete(name);
  assert.throws(()=>parseDeadReviewForm(v),/Missing/);
 }
 const p=form();p.set("confirmed","no");
 assert.throws(()=>parseDeadReviewForm(p),/confirmation/);
 const b=form();b.set("key",new Blob(["bad"]),"upload.txt");
 assert.throws(()=>parseDeadReviewForm(b),/Invalid/);
});
