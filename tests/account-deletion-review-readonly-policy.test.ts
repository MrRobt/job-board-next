import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(new URL(p,import.meta.url)),"utf8");

test("U01 admin deletion queue requires role check before read",()=>{
 const page=read("../app/admin/account-deletions/page.tsx");
 assert.match(page,/await requireAdmin\(\)/);
 assert.match(page,/listAccountDeletionReviewQueue\(/);
 assert.match(page,/人工审核/);
 assert.doesNotMatch(page,/\.delete\(|\.deleteMany\(|\.update\(|\.updateMany\(|\.create\(/);
});
test("U01 batch query does not mutate account, refund, or financial tables",()=>{
 const source=read("../lib/account-deletion-review-queue.ts");
 assert.match(source,/status:"PENDING_MANUAL_REVIEW"/);
 assert.match(source,/take:limit/);
 assert.match(source,/groupBy/);
 assert.match(source,/maskedEmail/);
 assert.doesNotMatch(source,/\.(?:create|update|upsert|delete)(?:Many)?\(/);
 assert.doesNotMatch(source,/passwordHash|providerTradeId|privateKey/);
 assert.match(source,/reviewEvents:\{select:\{reasonCode:true,recordedAt:true\}/);
});
