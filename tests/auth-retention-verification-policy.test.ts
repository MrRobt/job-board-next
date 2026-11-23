import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

test("U01 expired email verification records are included in bounded read-only-first auth retention",()=>{
 const source=readFileSync(fileURLToPath(new URL("../lib/auth-retention.ts",import.meta.url)),"utf8");
 assert.match(source,/expiredVerificationTokens/);
 assert.match(source,/deletedVerificationTokens/);
 assert.match(source,/emailVerificationToken\.count\(/);
 assert.match(source,/emailVerificationToken\.findMany\(/);
 assert.match(source,/emailVerificationToken\.deleteMany\(/);
 assert.match(source,/expiresAt:\s*\{\s*lte:\s*now/);
 assert.match(source,/batchSize/);
});
