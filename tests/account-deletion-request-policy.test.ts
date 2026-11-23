import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(path:string)=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),"utf8");

test("U01 account closure creates a review request, not an irreversible user purge",()=>{
 const schema=read("../prisma/schema.prisma");
 const migration=read("../prisma/migrations/20261123000300_account_deletion_request/migration.sql");
 const service=read("../lib/account-deletion-requests.ts");
 assert.match(schema,/model AccountDeletionRequest/);
 assert.match(schema,/userId String @unique/);
 assert.match(schema,/onDelete:Restrict/);
 assert.match(migration,/CREATE TABLE `AccountDeletionRequest`/);
 assert.match(migration,/ON DELETE RESTRICT/);
 assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|TRUNCATE TABLE/i);
 assert.match(service,/accountDeletionRequest\.createMany/);
 assert.match(service,/skipDuplicates:true/);
 assert.doesNotMatch(service,/\.(?:user|toolOrder|toolGrant|toolRun|order|refundCase)\.deleteMany|\.user\.delete\(/);
});
test("U01 account closure action requires session, password, explicit confirmation and same-origin POST",()=>{
 const action=read("../app/actions/account-deletion.ts");
 const page=read("../app/account/page.tsx");
 assert.match(action,/requireUser\(\)/);
 assert.match(action,/isTrustedActionOrigin/);
 assert.match(action,/verifyPassword/);
 assert.match(action,/getAll\("confirmDeletion"\)/);
 assert.match(action,/requestAccountDeletionReview\(user\.id\)/);
 assert.match(page,/requestAccountDeletion/);
 assert.match(page,/name="password"/);
 assert.match(page,/name="confirmDeletion"/);
 assert.match(page,/人工审核/);
});
