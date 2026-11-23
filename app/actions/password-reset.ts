"use server";
import {z} from "zod";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {db} from "@/lib/db";
import {allowAttempt} from "@/lib/rate-limit";
import {checkAuthenticationThrottle} from "@/lib/auth-throttle-policy";
import {issuePasswordReset,consumePasswordReset} from "@/lib/password-reset";
import {validPasswordResetInput} from "@/lib/password-reset-policy";
import {passwordResetDeliveryConfigured,sendPasswordResetEmail} from "@/lib/password-reset-delivery";
import {validVerificationToken,hashVerificationToken} from "@/lib/email-verification-policy";
import {isTrustedActionOrigin} from "@/lib/action-origin-policy";

async function permitted(scope:"password-reset-request"|"password-reset-confirm",identity:string,emailLimit:number,ipLimit:number){
 return checkAuthenticationThrottle({
  scope,identity,emailLimit,ipLimit,minutes:60,nodeEnv:process.env.NODE_ENV,
  configuredHeader:process.env.TRUSTED_CLIENT_IP_HEADER,headers:await headers()
 },allowAttempt);
}

async function sameOrigin():Promise<boolean>{
 const h=await headers();
 return isTrustedActionOrigin(h.get("origin"),h.get("host"));
}

export async function requestPasswordReset(form:FormData){
 if(!await sameOrigin())redirect("/forgot-password?sent=1");
 const values=form.getAll("email");
 const parsed=values.length===1?z.string().trim().email().max(254).safeParse(values[0]):null;
 if(!parsed?.success)redirect("/forgot-password?sent=1");
 const email=parsed.data.toLowerCase();
 if(!passwordResetDeliveryConfigured(process.env)||!await permitted("password-reset-request",email,3,12)){
  redirect("/forgot-password?sent=1");
 }
 try{
  const user=await db.user.findUnique({where:{email},select:{id:true,emailVerifiedAt:true}});
  if(user?.emailVerifiedAt){
   const candidate=await issuePasswordReset(user.id);
   if(candidate)await sendPasswordResetEmail(email,candidate);
  }
 }catch{
  // Same public response for nonexisting accounts and transient failures.
 }
 redirect("/forgot-password?sent=1");
}

export async function confirmPasswordReset(form:FormData){
 if(!await sameOrigin())redirect("/reset-password?error=1");
 const values=form.getAll("token");
 const candidate=values.length===1?values[0]:null;
 if(!validVerificationToken(candidate))redirect("/reset-password?error=1");
 const entries=form.getAll("newPassword");
 const proposed=entries.length===1?entries[0]:null;
 if(!validPasswordResetInput(proposed))redirect("/reset-password?error=1");
 const fingerprint=hashVerificationToken(candidate);
 if(!await permitted("password-reset-confirm",fingerprint,6,60))redirect("/reset-password?error=1");
 const completed=await consumePasswordReset(candidate,proposed);
 redirect(completed?"/login?reset=1":"/reset-password?error=1");
}
