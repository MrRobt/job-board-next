import {test} from "node:test";
import assert from "node:assert/strict";
import {modelUsageEvidence} from "../lib/career/model-usage";

const policy={inputFenPerMillion:100,outputFenPerMillion:200,maxRequestFen:2};
test("reported provider usage produces integer-fen estimated cost without storing user text",()=>{
 const e=modelUsageEvidence({prompt_tokens:1250,completion_tokens:600,total_tokens:1850},
  "approved-provider","approved-model",policy);
 assert.equal(e.status,"REPORTED");
 assert.equal(e.inputTokens,1250);
 assert.equal(e.outputTokens,600);
 assert.equal(e.reportedTotalTokens,1850);
 assert.equal(e.costFen,1);
 assert.equal(e.overBudget,false);
 assert.deepEqual(Object.keys(e).sort(),[
  "provider","model","status","inputTokens","outputTokens",
  "reportedTotalTokens","costFen","overBudget"
 ].sort());
});
test("a provider-reported overrun is flagged without inventing a payment outcome",()=>{
 const e=modelUsageEvidence({prompt_tokens:15000,completion_tokens:1000,total_tokens:16000},
  "approved-provider","approved-model",policy);
 assert.equal(e.status,"REPORTED");
 assert.equal(e.costFen,2);
 assert.equal(e.overBudget,false);
 const huge=modelUsageEvidence({prompt_tokens:30000,completion_tokens:1000,total_tokens:31000},
  "approved-provider","approved-model",policy);
 assert.equal(huge.costFen,4);
 assert.equal(huge.overBudget,true);
});
test("absent or invalid usage is explicitly unknown, not silently billed as zero",()=>{
 const absent=modelUsageEvidence(undefined,"approved-provider","approved-model",policy);
 assert.equal(absent.status,"UNREPORTED");
 assert.equal(absent.costFen,null);
 for(const raw of [
  {},{prompt_tokens:100,completion_tokens:10,total_tokens:109},
  {prompt_tokens:"100",completion_tokens:20},
  {prompt_tokens:-1,completion_tokens:40},
  {prompt_tokens:1.25,completion_tokens:1},
  {prompt_tokens:2000000,completion_tokens:2}
 ]){
  const record=modelUsageEvidence(raw,"approved-provider","approved-model",policy);
  assert.equal(record.status,"INVALID");
  assert.equal(record.costFen,null);
  assert.equal(record.overBudget,false);
 }
});
test("server billing identity must be safe for database display, without secrets or control characters",()=>{
 assert.throws(()=>modelUsageEvidence(undefined,"provider\nname","model",policy),/identity/);
 assert.throws(()=>modelUsageEvidence(undefined,"provider","",policy),/identity/);
 assert.throws(()=>modelUsageEvidence(undefined,"provider","x".repeat(121),policy),/identity/);
});
