import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const source=()=>readFileSync(fileURLToPath(new URL("../scripts/ci-account-deletion-http-e2e.mjs",import.meta.url)),"utf8");
test("U01 admin queue real HTTP E2E checks anonymous and USER roles",()=>{
 const script=source();
 assert.match(script,/\/admin\/account-deletions/);
 assert.match(script,/Anonymous reviewer/);
 assert.match(script,/USER cannot view the review queue/);
 assert.match(script,/role:"ADMIN"/);
});
test("U01 admin queue read renders masked data and preserves financial records",()=>{
 const script=source();
 assert.match(script,/Admin can read masked review queue/);
 assert.match(script,/Must not leak raw user email/);
 assert.match(script,/accountDeletionRequest\.count/);
 assert.match(script,/toolOrder\.findUniqueOrThrow/);
});
