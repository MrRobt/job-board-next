import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {pruneExpiredAuthRecords} from "../../lib/auth-retention";

test("U01 auth retention removes only expired email verification records in disposable MySQL",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable database required");
 const owned:string[]=[];
 const before=new Date("2001-01-01T00:00:00.000Z");
 const cutoff=new Date("2002-01-01T00:00:00.000Z");
 const after=new Date("2099-01-01T00:00:00.000Z");
 try{
  const first=await db.user.create({data:{
   email:"u01-retention-old-"+randomUUID()+"@example.invalid",passwordHash:"placeholder"
  }});
  owned.push(first.id);
  const second=await db.user.create({data:{
   email:"u01-retention-live-"+randomUUID()+"@example.invalid",passwordHash:"placeholder"
  }});
  owned.push(second.id);
  const expiredHash=createHash("sha256").update(randomUUID()).digest("hex");
  const activeHash=createHash("sha256").update(randomUUID()).digest("hex");
  await db.emailVerificationToken.create({data:{userId:first.id,tokenHash:expiredHash,expiresAt:before}});
  await db.emailVerificationToken.create({data:{userId:second.id,tokenHash:activeHash,expiresAt:after}});

  const dryRun=await pruneExpiredAuthRecords({now:cutoff,batchSize:1000});
  assert.equal(dryRun.mode,"DRY_RUN");
  assert.equal(dryRun.deletedVerificationTokens,0);
  assert.ok(dryRun.expiredVerificationTokens>=1);
  assert.ok(await db.emailVerificationToken.findUnique({where:{tokenHash:expiredHash}}));

  const applied=await pruneExpiredAuthRecords({now:cutoff,batchSize:1000,apply:true});
  assert.equal(applied.mode,"APPLIED");
  assert.ok(applied.deletedVerificationTokens>=1);
  assert.equal(await db.emailVerificationToken.findUnique({where:{tokenHash:expiredHash}}),null);
  assert.ok(await db.emailVerificationToken.findUnique({where:{tokenHash:activeHash}}));
  assert.ok(await db.user.findUnique({where:{id:first.id}}));
  assert.ok(await db.user.findUnique({where:{id:second.id}}));

  const again=await pruneExpiredAuthRecords({now:cutoff,batchSize:1000,apply:true});
  assert.equal(again.deletedVerificationTokens,0);
 } finally {
  if(owned.length)await db.user.deleteMany({where:{id:{in:owned}}});
  await db.$disconnect();
 }
});
