import {test} from "node:test";
import assert from "node:assert/strict";
import {parseOpsAckForm} from "../lib/career/ops-ack-form";

const payload=(overrides:Record<string,string|undefined>={})=>{
 const form=new FormData();
 for(const [k,v] of Object.entries({
  confirmed:"yes",key:"REFUND_IN_DOUBT",
  expectedOpenedAt:"2026-11-21T10:00:00.000Z",
  reason:"已核实异常退款工单，将继续人工渠道查单",...overrides
 }))if(v!==undefined)form.set(k,v);
 return form;
};
test("safe acknowledgment form parses only scoped fields, not user-supplied operator",()=>{
 const form=payload();
 form.set("operatorId","malicious");
 form.set("operatorRole","ADMIN");
 assert.deepEqual(parseOpsAckForm(form),{
  key:"REFUND_IN_DOUBT",expectedOpenedAt:new Date("2026-11-21T10:00:00.000Z"),
  reason:"已核实异常退款工单，将继续人工渠道查单"
 });
});
test("ack form rejects missing confirmation, unknown keys, malformed episodes",()=>{
 for(const change of [
  {confirmed:"no"},{key:"PAYMENT_FORCE_REFUND"},
  {expectedOpenedAt:"2026-11-21"},
  {expectedOpenedAt:"2026-02-30T10:00:00.000Z"},
  {expectedOpenedAt:"2026-11-21T10:00:00.001+08:00"},
  {reason:"short"},{reason:"x".repeat(501)},{reason:"人工核对单据\n不允许控制字符"},
 ]){
  assert.throws(()=>parseOpsAckForm(payload(change)));
 }
});
test("ack form rejects non-string FormData and missing values",()=>{
 const f=payload();
 f.set("key",new Blob(["not a key"]),"blob.txt");
 assert.throws(()=>parseOpsAckForm(f),/key/);
 f.delete("confirmed");
 assert.throws(()=>parseOpsAckForm(f),/confirmation/);
});
