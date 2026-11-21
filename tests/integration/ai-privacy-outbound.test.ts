import {test} from "node:test";
import assert from "node:assert/strict";
import {generate} from "../../lib/career/provider";

test("AI outbound boundary rejects contact identifiers before any fetch or provider setup",async()=>{
 const original=globalThis.fetch;
 let calls=0;
 globalThis.fetch=(async()=>{calls++;throw new Error("Unexpected model network call");}) as typeof fetch;
 try{
  for(const text of [
   "我是软件工程师，联系电话：+86 138-0013-8000，具备多年研发经验。",
   "我有项目交付经验，申请时使用邮箱 ａ＠ｅｘａｍｐｌｅ．ｃｏｍ，请优化简历。",
   "个人经历说明，身份证：110105 19491231 002X，请生成个人简历。"
  ]){
   await assert.rejects(generate({
    kind:"resume",role:"软件工程师",context:"技术岗位",text
   }),/sensitive contact details/);
  }
  await assert.rejects(generate({
   kind:"resume",role:"软件工程师",context:"",text:"过短"
  }),/too_small|length|至少|20|validation|text/i);
  assert.equal(calls,0,"no model request may be made for rejected content");
 }finally{globalThis.fetch=original;}
});
