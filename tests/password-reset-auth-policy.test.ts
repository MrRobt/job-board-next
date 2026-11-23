import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(path:string)=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),"utf8");

test("U01 forgot-password uses nonenumerating response and separate delivery approval",()=>{
 const action=read("../app/actions/password-reset.ts");
 assert.match(action,/passwordResetDeliveryConfigured\(process\.env\)/);
 assert.match(action,/permitted\("password-reset-request",email/);
 assert.match(action,/issuePasswordReset\(user\.id\)/);
 assert.match(action,/sendPasswordResetEmail\(email,candidate\)/);
 assert.match(action,/redirect\("\/forgot-password\?sent=1"\)/);
 assert.doesNotMatch(action,/startSession\(/);
});
test("reset link is only consumed through explicit POST with throttling",()=>{
 const page=read("../app/reset-password/page.tsx");
 const action=read("../app/actions/password-reset.ts");
 assert.match(page,/action=\{confirmPasswordReset\}/);
 assert.match(page,/type="hidden" name="token"/);
 assert.match(page,/type="password" name="newPassword"/);
 assert.match(action,/getAll\("token"\)/);
 assert.match(action,/getAll\("newPassword"\)/);
 assert.match(action,/permitted\("password-reset-confirm",fingerprint/);
 assert.match(action,/consumePasswordReset\(candidate,proposed\)/);
 assert.doesNotMatch(page,/consumePasswordReset\(/);
});
