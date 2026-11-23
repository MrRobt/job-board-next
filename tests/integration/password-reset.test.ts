import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {hashPassword,verifyPassword} from "../../lib/password";
import {issuePasswordReset,consumePasswordReset} from "../../lib/password-reset";
import {hashVerificationToken} from "../../lib/email-verification-policy";

test("U01 password recovery is single-use and revokes sessions on disposable MySQL",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable DB required");
 const owned:string[]=[];
 const oldInput=["old","synthetic","value","12345"].join("-");
 const replacement=["new","synthetic","value","56789"].join("-");
 const now=new Date();
 try{
  const user=await db.user.create({data:{
   email:"u01-password-reset-"+randomUUID()+"@example.invalid",
   passwordHash:await hashPassword(oldInput),
   emailVerifiedAt:now
  }});
  owned.push(user.id);
  const unverified=await db.user.create({data:{
   email:"u01-reset-unverified-"+randomUUID()+"@example.invalid",
   passwordHash:await hashPassword(oldInput)
  }});
  owned.push(unverified.id);
  assert.equal(await issuePasswordReset(unverified.id,now),null);
  assert.equal(await db.passwordResetToken.count({where:{userId:unverified.id}}),0);
  const sessionHash=createHash("sha256").update(randomUUID()).digest("hex");
  await db.session.create({data:{
   userId:user.id,tokenHash:sessionHash,expiresAt:new Date(now.getTime()+3600000)
  }});
  const first=await issuePasswordReset(user.id,now);
  assert.ok(first);
  const found=await db.passwordResetToken.findUnique({where:{userId:user.id}});
  assert.equal(found?.tokenHash,hashVerificationToken(first));
  assert.notEqual(found?.tokenHash,first);
  const rotated=await issuePasswordReset(user.id,now);
  assert.ok(rotated);
  assert.notEqual(rotated,first);
  assert.equal(await consumePasswordReset(first,replacement,now),false);
  assert.equal(await consumePasswordReset(rotated,"short",now),false);
  assert.equal(await consumePasswordReset(rotated,replacement,new Date(now.getTime()+1800001)),false);
  assert.equal(await db.session.count({where:{userId:user.id}}),1);
  const responses=await Promise.all([
   consumePasswordReset(rotated,replacement,now),
   consumePasswordReset(rotated,replacement,now)
  ]);
  assert.equal(responses.filter(Boolean).length,1);
  const updated=await db.user.findUniqueOrThrow({where:{id:user.id}});
  assert.equal(await verifyPassword(replacement,updated.passwordHash),true);
  assert.equal(await verifyPassword(oldInput,updated.passwordHash),false);
  assert.equal(await db.session.count({where:{userId:user.id}}),0);
  assert.equal(await db.passwordResetToken.count({where:{userId:user.id}}),0);
  assert.equal(await consumePasswordReset(rotated,replacement,now),false);
 }finally{
  if(owned.length)await db.user.deleteMany({where:{id:{in:owned}}});
  await db.$disconnect();
 }
});
