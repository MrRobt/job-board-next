import {test} from "node:test";
import assert from "node:assert/strict";
import {checkModelRequestBudget,readModelCostPolicy} from "../lib/career/model-cost-policy";

test("model configuration refuses absent, fractional and negative rates",()=>{
 assert.throws(()=>readModelCostPolicy({}),/cost policy/);
 const safe={AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS:"20",AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS:"80",AI_MAX_REQUEST_COST_FEN:"2"};
 assert.equal(readModelCostPolicy(safe).maxRequestFen,2);
 assert.throws(()=>readModelCostPolicy({...safe,AI_MAX_REQUEST_COST_FEN:"0"}),/cost policy/);
 assert.throws(()=>readModelCostPolicy({...safe,AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS:"0"}),/cost policy/);
 assert.throws(()=>readModelCostPolicy({...safe,AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS:"0"}),/cost policy/);
 assert.throws(()=>readModelCostPolicy({...safe,AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS:"1.2"}),/cost policy/);
});

test("AI cost estimation counts UTF-8 bytes plus framing and rounds up",()=>{
 const input={messages:[{role:"user",content:"技术岗位工作经验"}]};
 const policy={inputFenPerMillion:2000,outputFenPerMillion:10000,maxRequestFen:50};
 const result=checkModelRequestBudget(input,2500,policy);
 const bytes=Buffer.byteLength(JSON.stringify(input),"utf8");
 assert.equal(result.inputTokenUpperEstimate,bytes+1024);
 assert.equal(result.projectedMaxCostFen,
  Math.ceil(((bytes+1024)*2000+2500*10000)/1000000));
});
test("AI cost policy refuses unaffordable, oversized and invalid requests",()=>{
 const policy={inputFenPerMillion:2000,outputFenPerMillion:10000,maxRequestFen:1};
 assert.throws(()=>checkModelRequestBudget({messages:["test"]},2500,policy),/exceeds/);
 assert.throws(()=>checkModelRequestBudget({messages:["test"]},0,policy),/output limit/);
 assert.throws(()=>checkModelRequestBudget({text:"a".repeat(110000)},2500,policy),/size limit/);
 assert.throws(()=>checkModelRequestBudget(undefined,2500,policy),/payload/);
});
