import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {countRefundLedgerReviewHolds} from "../lib/career/refund-review-ops-read";

const page=()=>readFileSync(fileURLToPath(
 new URL("../app/admin/incidents/page.tsx",import.meta.url)),"utf8");

test("B04 refund ledger review count selects only fixed audit outcome and rejects partial/invalid results",async()=>{
 let input:unknown;
 const port={toolRefundInquiryEvent:{async count(args:unknown){
  input=args;return 2;
 }}};
 assert.equal(await countRefundLedgerReviewHolds(port),2);
 assert.deepEqual(input,{where:{outcome:"MANUAL_LEDGER_REVIEW",
  dispatch:{is:{state:"IN_DOUBT"}}}});
 for(const invalid of [-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  await assert.rejects(countRefundLedgerReviewHolds({
   toolRefundInquiryEvent:{async count(){return invalid;}}
  }),/Invalid/);
 }
 await assert.rejects(countRefundLedgerReviewHolds({
  toolRefundInquiryEvent:{async count():Promise<number>{throw Error("DB unavailable");}}
 }),/DB unavailable/);
});
test("B04 incident center shows held signed refund observations only behind admin read gate",()=>{
 const source=page();
 const role=source.indexOf("await requireAdmin()");
 const gate=source.indexOf("if(!gates.canRead)");
 const read=source.indexOf("countRefundLedgerReviewHolds(");
 assert.ok(role>=0&&gate>role&&read>gate,"Read must be admin-only and default-off");
 assert.match(source,/role="alert"/);
 assert.match(source,/退款已验签成功但本地权益无法结算/);
 assert.match(source,/href="\/admin\/refund-dispatch"/);
 assert.match(source,/人工核账/);
 assert.doesNotMatch(source,/toolRefund(?:Dispatch|InquiryEvent)\.(?:update|create|delete)/);
});
