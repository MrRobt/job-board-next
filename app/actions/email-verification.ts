"use server";
import {z} from "zod";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {db} from "@/lib/db";
import {allowAttempt} from "@/lib/rate-limit";
import {checkAuthenticationThrottle} from "@/lib/auth-throttle-policy";
import {issueEmailVerification,consumeEmailVerification} from "@/lib/email-verification";
import {validVerificationToken,hashVerificationToken} from "@/lib/email-verification-policy";
import {mailDeliveryConfigured,sendVerificationEmail} from "@/lib/email-verification-delivery";
import {isTrustedActionOrigin} from "@/lib/action-origin-policy";

async function permitted(scope:"verify"|"verify-resend",identity:string,emailLimit:number,ipLimit:number){
 return checkAuthenticationThrottle({
  scope,identity,emailLimit,ipLimit,minutes:60,
  nodeEnv:process.env.NODE_ENV,
  configuredHeader:process.env.TRUSTED_CLIENT_IP_HEADER,
  headers:await headers()
 },allowAttempt);
}

async function sameOrigin():Promise<boolean>{
 const h=await headers();
 return isTrustedActionOrigin(h.get("origin"),h.get("host"));
}

export async function resendEmailVerification(form:FormData){
 if(!await sameOrigin())redirect("/verify-email?resent=1");
 const values=form.getAll("email");
 const parsed=values.length===1?z.string().trim().email().max(254).safeParse(values[0]):null;
 if(!parsed?.success)redirect("/verify-email?resent=1");
 const email=parsed.data.toLowerCase();
 if(!mailDeliveryConfigured(process.env)||!await permitted("verify-resend",email,3,12)){
  redirect("/verify-email?resent=1");
 }
 try{
  const user=await db.user.findUnique({where:{email},select:{id:true,emailVerifiedAt:true}});
  if(user&&!user.emailVerifiedAt){
   const candidate=await issueEmailVerification(user.id);
   if(candidate)await sendVerificationEmail(email,candidate);
  }
 }catch{
  // Intentionally do not expose account existence or mailer details.
 }
 redirect("/verify-email?resent=1");
}

export async function confirmEmailVerification(form:FormData){
 if(!await sameOrigin())redirect("/verify-email?error=1");
 const values=form.getAll("token");
 const candidate=values.length===1?values[0]:null;
 if(!validVerificationToken(candidate))redirect("/verify-email?error=1");
 const fingerprint=hashVerificationToken(candidate);
 if(!await permitted("verify",fingerprint,6,60))redirect("/verify-email?error=1");
 const ok=await consumeEmailVerification(candidate);
 redirect(ok?"/login?verified=1":"/verify-email?error=1");
}
