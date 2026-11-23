import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const page=()=>readFileSync(fileURLToPath(
 new URL("../app/admin/refund-dispatch/page.tsx",import.meta.url)),"utf8");

test("B06 admin refund dispatch page checks role before read-only integrity assessment",()=>{
 const source=page();
 assert.match(source,/await requireAdmin\(\)/);
 assert.match(source,/assessRefundDispatchIntegrity\(/);
 assert.match(source,/hasReservedOrSuccessfulRun/);
 assert.match(source,/grant:\{select:\{total:true,remaining:true/);
 assert.match(source,/退款派发账本/);
 assert.match(source,/对账风险/);
});
test("B06 admin integrity indicators cannot be mistaken for external proof or authorized refund",()=>{
 const source=page();
 assert.match(source,/只读/);
 assert.match(source,/并非商户回款证明/);
 assert.match(source,/禁止自动补款/);
 assert.doesNotMatch(source,/db\.tool(?:Order|Grant|RefundDispatch)\.update/);
});
