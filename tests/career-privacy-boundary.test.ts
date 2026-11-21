import {test} from "node:test";
import assert from "node:assert/strict";
import {hasContact} from "../lib/career/contracts";

test("AI privacy boundary catches formatted mainland contacts and Unicode width variants",()=>{
 for(const item of [
  "13800138000",
  "联系电话：+86 138-0013-8000",
  "电话 138 0013 8000",
  "手机号：＋８６ １３８ ００１３ ８０００",
  "邮箱：me@example.com",
  "电子邮箱：ｍｅ＠ｅｘａｍｐｌｅ．ｃｏｍ",
  "身份证号：11010519491231002X",
  "身份证：110105 19491231 002X"
 ])assert.equal(hasContact(item),true,item);
});
test("AI privacy boundary does not mistake typical career material for identifiers",()=>{
 for(const item of [
  "负责 Next.js 项目并通过测试，持续迭代交付",
  "2026 年营收增长 30%，团队有 13 位工程师",
  "在 2023-2025 年负责微信支付技术对接",
  "已具备8年以上技术管理经验，带领团队完成开发",
  "设计 API 并优化 MySQL 8.0 查询性能"
 ])assert.equal(hasContact(item),false,item);
});
