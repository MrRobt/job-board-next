"use server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {db} from "@/lib/db";
import {verifyPassword} from "@/lib/password";
import {allowAttempt} from "@/lib/rate-limit";
import {isTrustedActionOrigin} from "@/lib/action-origin-policy";
import {requestAccountDeletionReview} from "@/lib/account-deletion-requests";

/** Record a review request, never directly erase financial or user records. */
export async function requestAccountDeletion(form:FormData){
 const user=await requireUser();
 const h=await headers();
 if(!isTrustedActionOrigin(h.get("origin"),h.get("host"))){
  redirect("/account?deletionError=1");
 }
 const confirmations=form.getAll("confirmDeletion");
 const passwords=form.getAll("password");
 const candidate=passwords.length===1?passwords[0]:null;
 if(confirmations.length!==1||confirmations[0]!=="REQUEST_MANUAL_REVIEW"||
    typeof candidate!=="string"||candidate.length<12||candidate.length>128||
    !await allowAttempt("account-deletion-request",user.id,3,60)){
  redirect("/account?deletionError=1");
 }
 let passwordValid=false;
 try{
  const record=await db.user.findUnique({where:{id:user.id},select:{passwordHash:true}});
  passwordValid=Boolean(record&&await verifyPassword(candidate,record.passwordHash));
 }catch{
  // Password verification errors fail closed. Do not log password or the form.
 }
 if(!passwordValid)redirect("/account?deletionError=1");
 try{
  await requestAccountDeletionReview(user.id);
 }catch{
  redirect("/account?deletionError=1");
 }
 redirect("/account?deletionRequested=1");
}
