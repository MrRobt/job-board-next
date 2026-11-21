import {test} from "node:test";
import assert from "node:assert/strict";
import {checkQuotedModelCosts} from "../lib/career/model-cost-check";
import {modelUsageEvidence} from "../lib/career/model-usage";

const policy={inputFenPerMillion:100,outputFenPerMillion:200,maxRequestFen:1};
const provider="approved-service",model="approved-model";
const record=(runId:string,prompt=1250,completion=600)=>({
 runId,usage:modelUsageEvidence({
  prompt_tokens:prompt,completion_tokens:completion,total_tokens:prompt+completion
 },provider,model,policy)
});
const check=(rows:Parameters<typeof checkQuotedModelCosts>[2],bill:number|null)=>
 checkQuotedModelCosts(provider,model,rows,bill,policy);
test("matching sanitized quoted costs is not mistaken for certified provider billing",()=>{
 const a=record("run-1"),b=record("run-2");
 assert.equal(a.usage.costFen,1);
 const result=check([a,b],2);
 assert.equal(result.status,"INPUT_MATCH");
 assert.deepEqual(result.reasonCodes,[]);
 assert.equal(result.knownQuotedFen,2);
 assert.equal(result.pricedRunCount,2);
 assert.equal(result.unknownRunCount,0);
 assert.equal(result.differenceFen,0);
 assert.equal(JSON.stringify(result).includes("prompt_tokens"),false);
});
test("absent and malformed usage remain unknown rather than zero cost",()=>{
 const known=record("run-1");
 const missing={runId:"run-2",usage:modelUsageEvidence(undefined,provider,model,policy)};
 const invalid={runId:"run-3",usage:modelUsageEvidence({
  prompt_tokens:100,completion_tokens:-2
 },provider,model,policy)};
 const result=check([known,missing,invalid],1);
 assert.equal(result.status,"REVIEW_REQUIRED");
 assert.equal(result.knownQuotedFen,1);
 assert.equal(result.unknownRunCount,2);
 assert.equal(result.differenceFen,null);
 assert.deepEqual(result.reasonCodes,["INVALID_USAGE","MISSING_USAGE"]);
});
test("invoice differences, missing invoice and budget overruns require manual review",()=>{
 const a=record("run-1");
 assert.deepEqual(check([a],5).reasonCodes,["AMOUNT_DIFFERENCE"]);
 assert.equal(check([a],null).differenceFen,null);
 assert.deepEqual(check([a],null).reasonCodes,["MISSING_INVOICE"]);
 const costly=record("run-large",30000,1000);
 const result=check([costly],4);
 assert.equal(result.overBudgetRunCount,1);
 assert.equal(result.status,"REVIEW_REQUIRED");
 assert.ok(result.reasonCodes.includes("OVER_BUDGET"));
});
test("duplicate, contradictory, changed-price or out-of-scope rows fail closed",()=>{
 const a=record("run-1");
 assert.throws(()=>check([a,a],2),/Duplicate/);
 assert.throws(()=>check([],0),/count/);
 assert.throws(()=>check([a],-1),/amount/);
 assert.throws(()=>check([a],0.2),/amount/);
 assert.throws(()=>checkQuotedModelCosts(provider,"other-model",[a],1,policy),/scope/);
 assert.throws(()=>check([{runId:"wrong",usage:{...a.usage,status:"UNREPORTED",costFen:1}}],1),/Contradictory/);
 assert.throws(()=>check([{runId:"wrong",usage:{...a.usage,reportedTotalTokens:999}}],1),/Contradictory/);
 assert.throws(()=>check([{runId:"unsafe\nidentifier",usage:a.usage}],1),/observation/);
 assert.throws(()=>check([{runId:"changed",usage:{...a.usage,costFen:5}}],5),/approved pricing/);
 assert.throws(()=>check([{runId:"changed",usage:{...a.usage,overBudget:true}}],1),/approved pricing/);
 assert.throws(()=>checkQuotedModelCosts(provider,model,[a],1,{
   ...policy,inputFenPerMillion:0
 }),/pricing policy/);
});
