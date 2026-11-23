import "server-only";
import {Prisma} from "@prisma/client";
import {db} from "./db";
import {makeVerificationToken,hashVerificationToken,verificationExpiresAt,validVerificationToken} from "./email-verification-policy";

export async function issueEmailVerification(userId:string,now=new Date()):Promise<string|null>{
 const expiry=verificationExpiresAt(now);
 const candidate=makeVerificationToken();
 const digest=hashVerificationToken(candidate);
 const result=await db.$transaction(async tx=>{
  const user=await tx.user.findUnique({where:{id:userId},select:{emailVerifiedAt:true}});
  if(!user||user.emailVerifiedAt!==null)return false;
  await tx.emailVerificationToken.upsert({
   where:{userId},
   create:{userId,tokenHash:digest,expiresAt:expiry},
   update:{tokenHash:digest,expiresAt:expiry,createdAt:now}
  });
  return true;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 return result?candidate:null;
}

/** Consume a one-use token and verify the owning user atomically. */
export async function consumeEmailVerification(candidate:unknown,now=new Date()):Promise<boolean>{
 if(!validVerificationToken(candidate)||!Number.isFinite(now.getTime()))return false;
 const digest=hashVerificationToken(candidate);
 try{
  return await db.$transaction(async tx=>{
   const found=await tx.emailVerificationToken.findUnique({
    where:{tokenHash:digest},select:{userId:true,expiresAt:true}
   });
   if(!found||found.expiresAt.getTime()<=now.getTime())return false;
   const claimed=await tx.emailVerificationToken.deleteMany({
    where:{tokenHash:digest,expiresAt:{gt:now}}
   });
   if(claimed.count!==1)return false;
   const updated=await tx.user.updateMany({
    where:{id:found.userId,emailVerifiedAt:null},
    data:{emailVerifiedAt:now}
   });
   if(updated.count!==1)return false;
   await tx.emailVerificationToken.deleteMany({where:{userId:found.userId}});
   return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }catch{
  return false;
 }
}
