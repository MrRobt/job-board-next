import {test} from "node:test";
import assert from "node:assert/strict";
import {validateSafeModelOutput} from "../lib/career/output-safety";

const sample={
 summary:"岗位匹配建议：根据真实经历突出项目成果。",
 sections:[
  {title:"项目能力",items:["说明关键技术决策及真实结果。"]},
  {title:"行为面试",items:["用 STAR 方法说明团队协作经历。"]}
 ],
 next:["准备一次完整的模拟面试练习。"]
};
test("model output privacy gate preserves safe report unchanged",()=>{
 assert.deepEqual(validateSafeModelOutput(sample),sample);
});
test("model output privacy gate rejects formatted contact values in every rendered field",()=>{
 const cases=[
  {...sample,summary:"建议联系 +86 138-0013-8000 获取机会。"},
  {...sample,sections:[{title:"邮箱 ｍｅ＠ｅｘａｍｐｌｅ．ｃｏｍ",items:["普通建议"]},sample.sections[1]]},
  {...sample,sections:[{title:"其他建议",items:["身份证：110105 19491231 002X"]},sample.sections[1]]},
  {...sample,next:["如需练习发送邮件至 coach@example.org。"]}
 ];
 for(const report of cases){
  assert.throws(()=>validateSafeModelOutput(report),/sensitive contact/i);
 }
});
test("model output gate fails closed on schema-invalid content",()=>{
 assert.throws(()=>validateSafeModelOutput({...sample,sections:[]}));
 assert.throws(()=>validateSafeModelOutput({...sample,summary:""}));
});
