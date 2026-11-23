import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(new URL(p,import.meta.url)),"utf8");

test("U01 review-audit HTTP workflow uses isolated MySQL8 and no external payment, AI, mail",()=>{
 const yaml=read("../.github/workflows/account-deletion-review-audit-http.yml");
 assert.match(yaml,/image: mysql:8\.0/);
 assert.match(yaml,/MYSQL_DATABASE:\s*account_review_audit_ci/);
 assert.match(yaml,/INTEGRATION_TEST_DATABASE:\s*"true"/);
 assert.match(yaml,/ENABLE_ACCOUNT_DELETION_REVIEW_WRITE:\s*"true"/);
 for(const k of ["ENABLE_REAL_PAYMENT","ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI",
  "ENABLE_EMAIL_VERIFICATION_DELIVERY","ENABLE_PASSWORD_RESET_DELIVERY",
  "ENABLE_REFUND_SEND","ENABLE_PAYMENT_RECONCILIATION"]){
  assert.match(yaml,new RegExp(k+':\\s*"false"'),k);
 }
 assert.match(yaml,/scripts\/ci-account-deletion-review-audit-http\.mjs/);
 assert.doesNotMatch(yaml,/--force-reset|--accept-data-loss|prisma db push/);
});
test("U01 real review audit HTTP covers role, origin, confirmation, replay, and non-erasure",()=>{
 const script=read("../scripts/ci-account-deletion-review-audit-http.mjs");
 assert.match(script,/INTEGRATION_TEST_DATABASE/);
 assert.match(script,/https:\/\/attacker\.invalid/);
 assert.match(script,/accountDeletionReviewEvent/);
 assert.match(script,/ALREADY_RECORDED/);
 assert.match(script,/NEEDS_PRIVACY_REVIEW/);
 assert.match(script,/toolOrder\.findUniqueOrThrow/);
 assert.match(script,/CI_ACCOUNT_DELETION_REVIEW_HTTP/);
});
