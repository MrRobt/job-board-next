import "server-only";
import {Prisma} from "@prisma/client";
import {db} from "./db";
import {hashPassword} from "./password";
import {makeVerificationToken,hashVerificationToken,validVerificationToken} from "./email-verification-policy";
import {passwordResetExpiresAt,validPasswordResetInput} from "./password-reset-policy";

/**
 * Only a verified account can request recovery; caller must authorize delivery
 * separately. The database stores a digest, never the raw bearer credential.
 */
export async function issuePasswordReset(userId:string,now:Date=new Date()):Promise<string|null>{
 const expiresAt=passwordResetExpiresAt(now);
 const candidate=makeVerificationToken();
 const digest=hashVerificationToken(candidate);
 try{
  const eligible=await db.$transaction(async tx=>{
   const user=await tx.user.findUnique({where:{id:userId},select:{emailVerifiedAt:true}});
   if(!user?.emailVerifiedAt)return false;
   await tx.passwordResetToken.upsert({
    where:{userId},create:{userId,tokenHash:digest,expiresAt},
    update:{tokenHash:digest,expiresAt,createdAt:now}
   });
   return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return eligible?candidate:null;
 }catch{return null;}
}

/** Password and all previous sessions are atomically updated after a one-use claim. */
export async function consumePasswordReset(candidate:unknown,nextPassword:unknown,now=new Date()):Promise<boolean>{
 if(!validVerificationToken(candidate)||!validPasswordResetInput(nextPassword)||
    !Number.isFinite(now.getTime()))return false;
 let replacement:string;
 try{replacement=await hashPassword(nextPassword);}catch{return false;}
 const digest=hashVerificationToken(candidate);
 try{
  return await db.$transaction(async tx=>{
   const found=await tx.passwordResetToken.findUnique({
    where:{tokenHash:digest},select:{userId:true,expiresAt:true}
   });
   if(!found||found.expiresAt.getTime()<=now.getTime())return false;
   const claimed=await tx.passwordResetToken.deleteMany({
    where:{tokenHash:digest,expiresAt:{gt:now}}
   });
   if(claimed.count!==1)return false;
   const updated=await tx.user.updateMany({
    where:{id:found.userId,emailVerifiedAt:{not:null}},
    data:{passwordHash:replacement}
   });
   if(updated.count!==1)throw new Error("Reset state conflict");
   await tx.session.deleteMany({where:{userId:found.userId}});
   await tx.passwordResetToken.deleteMany({where:{userId:found.userId}});
   return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }catch{return false;}
}
