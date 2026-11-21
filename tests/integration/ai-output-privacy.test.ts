import {test} from "node:test";
import assert from "node:assert/strict";
import {generate,generateMeasured} from "../../lib/career/provider";

test("model output containing contact details is rejected before report delivery",async()=>{
 const originalFetch=globalThis.fetch;
 const keys=[
  "ENABLE_LIVE_AI","AI_COMPLIANCE_APPROVED","AI_BASE_URL","AI_APPROVED_BASE_URLS",
  "AI_PRIVACY_NOTICE_URL","AI_API_KEY","AI_MODEL","AI_PROVIDER_NAME",
  "AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS",
  "AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS","AI_MAX_REQUEST_COST_FEN"
 ];
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 let calls=0;
 try{
  Object.assign(process.env,{
   ENABLE_LIVE_AI:"true",AI_COMPLIANCE_APPROVED:"true",
   AI_BASE_URL:"https://api.openai.com/v1",
   AI_APPROVED_BASE_URLS:"https://api.openai.com/v1",
   AI_PRIVACY_NOTICE_URL:"https://example.com/privacy",
   AI_API_KEY:"[REDACTED_SECRET]",AI_MODEL:"offline-test",AI_PROVIDER_NAME:"offline-test",
   AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS:"100",
   AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS:"200",
   AI_MAX_REQUEST_COST_FEN:"100"
  });
  globalThis.fetch=(async()=>{
   calls++;
   const report={
    summary:"可向 coach@example.org 发送更多材料。",
    sections:[
     {title:"岗位技能",items:["展示真实技术方案。"]},
     {title:"项目成果",items:["说明量化成果。"]}
    ],
    next:["继续练习 STAR 表达。"]
   };
   return new Response(JSON.stringify({
    choices:[{message:{content:JSON.stringify(report)}}],
    usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}
   }),{status:200});
  }) as typeof fetch;
  const request={kind:"resume" as const,role:"软件工程师",context:"后台研发",
   text:"我参与了服务开发及上线，主要负责接口性能优化与团队协作。"};
  await assert.rejects(generate(request),/sensitive contact/i);
  await assert.rejects(generateMeasured(request),/sensitive contact/i);
  assert.equal(calls,2,"only mocked network calls; no report returned");
 }finally{
  globalThis.fetch=originalFetch;
  for(const key of keys){
   if(before[key]===undefined)delete process.env[key];
   else process.env[key]=before[key];
  }
 }
});
