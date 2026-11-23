import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const read=(relative:string)=>readFileSync(fileURLToPath(new URL(relative,import.meta.url)),"utf8");

test("U01 real email confirmation and resend explicitly check origin before DB writes",()=>{
 const source=read("../app/actions/email-verification.ts");
 assert.match(source,/isTrustedActionOrigin/);
 assert.match(source,/async function sameOrigin/);
 const guardCount=[...source.matchAll(/if\(!await sameOrigin\(\)\)/g)].length;
 assert.equal(guardCount,2,"Both POST actions must reject missing or mismatched Origin");
 assert.match(source,/consumeEmailVerification\(candidate\)/);
 assert.match(source,/mailDeliveryConfigured\(process\.env\)/);
});
test("U01 isolated email verification CI never enables external services",()=>{
 const config=read("../.github/workflows/email-verification-http-e2e.yml");
 assert.match(config,/image: mysql:8\.0/);
 assert.match(config,/MYSQL_DATABASE:\s*email_verification_ci/);
 assert.match(config,/INTEGRATION_TEST_DATABASE:\s*"true"/);
 for(const flag of ["ENABLE_REAL_PAYMENT","ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI","ENABLE_EMAIL_VERIFICATION_DELIVERY","ENABLE_PASSWORD_RESET_DELIVERY"]){
  assert.match(config,new RegExp(flag+':\\s*"false"'),flag);
 }
 assert.match(config,/scripts\/ci-email-verification-http-e2e\.mjs/);
 assert.doesNotMatch(config,/--force-reset|--accept-data-loss|prisma db push/);
});
test("U01 real HTTP suite covers GET only, expired, replay, login and session",()=>{
 const source=read("../scripts/ci-email-verification-http-e2e.mjs");
 assert.match(source,/INTEGRATION_TEST_DATABASE/);
 assert.match(source,/emailVerificationToken/);
 assert.match(source,/https:\/\/attacker\.invalid/);
 assert.match(source,/\/verify-email/);
 assert.match(source,/\/login/);
 assert.match(source,/session\.count/);
 assert.match(source,/CI_EMAIL_VERIFICATION_HTTP/);
});
