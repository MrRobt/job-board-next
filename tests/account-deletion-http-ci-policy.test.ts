import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(new URL(p,import.meta.url)),"utf8");

test("U01 account closure HTTP CI is restricted to disposable MySQL and has all external services off",()=>{
 const yaml=read("../.github/workflows/account-deletion-http-e2e.yml");
 assert.match(yaml,/image: mysql:8\.0/);
 assert.match(yaml,/MYSQL_DATABASE:\s*account_deletion_http_ci/);
 assert.match(yaml,/INTEGRATION_TEST_DATABASE:\s*"true"/);
 for(const key of ["ENABLE_REAL_PAYMENT","ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI","ENABLE_TOOL_PAYMENTS","ENABLE_EMAIL_VERIFICATION_DELIVERY","ENABLE_PASSWORD_RESET_DELIVERY"]){
  assert.match(yaml,new RegExp(key+':\\s*"false"'),key);
 }
 assert.match(yaml,/scripts\/ci-account-deletion-http-e2e\.mjs/);
 assert.doesNotMatch(yaml,/--force-reset|--accept-data-loss|prisma db push|production\.env/i);
});
test("U01 real HTTP acceptance tests auth, CSRF, password, idempotence and financial preservation",()=>{
 const js=read("../scripts/ci-account-deletion-http-e2e.mjs");
 assert.match(js,/INTEGRATION_TEST_DATABASE/);
 assert.match(js,/https:\/\/attacker\.invalid/);
 assert.match(js,/confirmDeletion/);
 assert.match(js,/deletionError/);
 assert.match(js,/accountDeletionRequest/);
 assert.match(js,/toolOrder/);
 assert.match(js,/CI_ACCOUNT_DELETION_HTTP/);
});
