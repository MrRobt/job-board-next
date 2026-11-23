import {test} from "node:test";
import assert from "node:assert/strict";
import {db} from "../../lib/db";
import {issueEmailVerification,consumeEmailVerification} from "../../lib/email-verification";
import {hashVerificationToken} from "../../lib/email-verification-policy";
import {randomUUID} from "node:crypto";

test("U01 one-time email verification on disposable MySQL",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable DB required");
 const id="u01_"+randomUUID();
 const email="u01-"+randomUUID()+"@example.invalid";
 const now=new Date();
 try{
  await db.user.create({data:{id,email,passwordHash:"placeholder"}});
  const first=await issueEmailVerification(id,now);
  assert.ok(first);
  assert.equal(first.length,64);
  const stored=await db.emailVerificationToken.findUnique({where:{userId:id}});
  assert.ok(stored);
  assert.equal(stored.tokenHash,hashVerificationToken(first));
  assert.notEqual(stored.tokenHash,first);
  assert.equal(await consumeEmailVerification("invalid",now),false);
  const second=await issueEmailVerification(id,now);
  assert.ok(second);
  assert.notEqual(second,first);
  assert.equal(await consumeEmailVerification(first,now),false);
  await db.emailVerificationToken.update({where:{userId:id},data:{expiresAt:new Date(now.getTime()-1000)}});
  assert.equal(await consumeEmailVerification(second,now),false);
  assert.equal((await db.user.findUniqueOrThrow({where:{id}})).emailVerifiedAt,null);
  const candidate=await issueEmailVerification(id,now);
  assert.ok(candidate);
  const attempts=await Promise.all([consumeEmailVerification(candidate,now),consumeEmailVerification(candidate,now)]);
  assert.equal(attempts.filter(Boolean).length,1);
  const user=await db.user.findUniqueOrThrow({where:{id}});
  assert.ok(user.emailVerifiedAt);
  assert.equal(await db.emailVerificationToken.count({where:{userId:id}}),0);
  assert.equal(await consumeEmailVerification(candidate,now),false);
  assert.equal(await issueEmailVerification(id,now),null);
 }finally{
  await db.user.deleteMany({where:{id}});
  await db.$disconnect();
 }
});
