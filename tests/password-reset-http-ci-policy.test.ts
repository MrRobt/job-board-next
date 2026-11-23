import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(rel:string)=>readFileSync(fileURLToPath(new URL(rel,import.meta.url)),"utf8");

test("U01 password reset real HTTP CI is disposable and disables outbound services",()=>{
 const workflow=read("../.github/workflows/password-reset-http-e2e.yml");
 assert.match(workflow,/image: mysql:8\.0/);
 assert.match(workflow,/MYSQL_DATABASE:\s*password_reset_ci/);
 assert.match(workflow,/INTEGRATION_TEST_DATABASE:\s*"true"/);
 for(const key of ["ENABLE_REAL_PAYMENT","ENABLE_LIVE_AI","ENABLE_PASSWORD_RESET_DELIVERY","ENABLE_EMAIL_VERIFICATION_DELIVERY"]){
  assert.match(workflow,new RegExp(key+':\\s*"false"'),key);
 }
 assert.match(workflow,/scripts\/ci-password-reset-http-e2e\.mjs/);
 assert.doesNotMatch(workflow,/--force-reset|--accept-data-loss|db push/);
});
test("U01 security harness checks origin, token replay and session invalidation",()=>{
 const script=read("../scripts/ci-password-reset-http-e2e.mjs");
 assert.match(script,/INTEGRATION_TEST_DATABASE/);
 assert.match(script,/passwordResetToken/);
 assert.match(script,/https:\/\/attacker\.invalid/);
 assert.match(script,/newPassword/);
 assert.match(script,/reset-password/);
 assert.match(script,/session\.count/);
 assert.match(script,/CI/);
});
