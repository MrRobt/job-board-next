import {test} from "node:test";
import assert from "node:assert/strict";
import {generate,liveAvailable} from "../../lib/career/provider";

test("approved model requests are refused before network when cost policy is missing or over budget",async()=>{
 const original=globalThis.fetch;
 const keys=[
  "ENABLE_LIVE_AI","AI_COMPLIANCE_APPROVED","AI_BASE_URL","AI_APPROVED_BASE_URLS",
  "AI_PRIVACY_NOTICE_URL","AI_API_KEY","AI_MODEL","AI_PROVIDER_NAME",
  "AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS",
  "AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS","AI_MAX_REQUEST_COST_FEN"
 ];
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 let calls=0;
 globalThis.fetch=(async()=>{
  calls++;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   summary:"求职练习",sections:[
    {title:"岗位匹配",items:["补充项目证据"]},
    {title:"表达优化",items:["展示清晰结果"]}
   ],next:["复核真实经历"]
  })}}]}),{status:200});
 }) as typeof fetch;
 try{
  Object.assign(process.env,{
   ENABLE_LIVE_AI:"true",AI_COMPLIANCE_APPROVED:"true",
   AI_BASE_URL:"https://api.openai.com/v1",AI_APPROVED_BASE_URLS:"https://api.openai.com/v1",
   AI_PRIVACY_NOTICE_URL:"https://api.openai.com/privacy",
   AI_API_KEY:"[REDACTED_SECRET]",AI_MODEL:"local-test",AI_PROVIDER_NAME:"local-test"
  });
  const payload={kind:"resume" as const,role:"软件工程师",context:"技术岗位",
   text:"负责软件研发交付与架构设计，曾优化服务性能和项目质量"};
  delete process.env.AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS;
  assert.equal(liveAvailable(),false);
  await assert.rejects(generate(payload),/AI disabled/);
  assert.equal(calls,0);
  Object.assign(process.env,{
   AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS:"100000",
   AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS:"100000",
   AI_MAX_REQUEST_COST_FEN:"1"
  });
  assert.equal(liveAvailable(),true);
  await assert.rejects(generate(payload),/exceeds operator cost limit/);
  assert.equal(calls,0);
  process.env.AI_MAX_REQUEST_COST_FEN="500";
  const result=await generate(payload);
  assert.equal(result.summary,"求职练习");
  assert.equal(calls,1);
 }finally{
  globalThis.fetch=original;
  for(const k of keys){
   if(saved[k]===undefined)delete process.env[k];
   else process.env[k]=saved[k];
  }
 }
});
