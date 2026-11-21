import { test } from "node:test";
import assert from "node:assert/strict";
import {validateSafeModelOutput} from "../lib/career/output-safety";

const report = {
 summary:"根据真实经历突出项目责任与可验证成果。",
 sections:[
  {title:"专业能力",items:["用 STAR 方式描述技术决策。"]},
  {title:"项目协作",items:["使用实际数据说明沟通结果。"]}
 ],
 next:["自行整理技术经历，再进行模拟问答。"]
};

test("model report never supplies unsolicited external contact or document collection links",()=>{
 const variants=[
  "请访问 https://interview.example.org/collect 填写资料",
  "下一步到 www.recruitment.example.org 上传简历",
  "请发送到 mailto:recruit@example.org",
  "使用 tel:+86-1234 获取帮助",
  "打开 http://careers.example.org/",
  "用 Markdown 打开 [外部联系](https://portal.example.org/private)",
  "请访问 ｈｔｔｐｓ：／／ｐｏｒｔａｌ．ｅｘａｍｐｌｅ．ｏｒｇ",
  "打开 h​ttps://portal.example.org/collect"
 ];
 for(const text of variants){
  const changed={...report,next:[text]};
  assert.throws(()=>validateSafeModelOutput(changed),/external link|sensitive contact/i,text);
 }
});
test("external links are rejected across summaries, section titles and item text",()=>{
 const cases=[
  {...report,summary:"点击 https://example.org 查看详情"},
  {...report,sections:[{...report.sections[0],title:"www.example.org"},report.sections[1]]},
  {...report,sections:[{...report.sections[0],items:["下载 ftp://files.example.org/cv"]},report.sections[1]]}
 ];
 for(const content of cases)assert.throws(()=>validateSafeModelOutput(content),/external link/i);
});
test("safe professional statements and technology terms remain allowed",()=>{
 const safeTerms=[
  "负责 HTTP API、MySQL 与 Go 服务研发，不附第三方链接。",
  "曾使用 Node.js、Vue.js、Python.py 及 React 技术栈。",
  "负责 C++、C# 与 version 1.2.3 的项目维护。"
 ];
 for(const summary of safeTerms){
  const clean={...report,summary};
  assert.deepEqual(validateSafeModelOutput(clean),clean);
 }
});
