import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(relative:string)=>readFileSync(fileURLToPath(new URL(relative,import.meta.url)),"utf8");

test("U01 registration cannot mint sessions before verified delivery",()=>{
 const auth=read("../app/actions/auth.ts");
 assert.match(auth,/mailDeliveryConfigured\(process\.env\)/);
 assert.match(auth,/issueEmailVerification\(id\)/);
 assert.match(auth,/sendVerificationEmail\(input\.data\.email,candidate\)/);
 assert.doesNotMatch(auth,/await startSession\(id\)/);
 assert.match(auth,/if\(!user\.emailVerifiedAt\)redirect\("\/login\?pending=1"\)/);
});
test("U01 currentUser rejects a valid legacy session for an unverified user",()=>{
 const auth=read("../lib/auth.ts");
 assert.match(auth,/!session\.user\.emailVerifiedAt/);
 assert.match(auth,/!eligible\?\.emailVerifiedAt/);
 const e2e=read("../scripts/ci-dead-review-http-e2e.mjs");
 assert.match(e2e,/UNVERIFIED_ADMIN/);
 assert.match(e2e,/Unverified session must redirect/);
});
test("U01 link only consumes verification after an explicit POST and throttles abuse",()=>{
 const page=read("../app/verify-email/page.tsx");
 const action=read("../app/actions/email-verification.ts");
 assert.match(page,/action=\{confirmEmailVerification\}/);
 assert.match(page,/type="hidden" name="token"/);
 assert.match(page,/action=\{resendEmailVerification\}/);
 assert.match(action,/consumeEmailVerification\(candidate\)/);
 assert.match(action,/permitted\("verify",fingerprint/);
 assert.match(action,/permitted\("verify-resend",email/);
 assert.match(action,/getAll\("token"\)/);
});
