"use server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/auth";
import {allowAttempt} from "@/lib/rate-limit";
import {isTrustedActionOrigin} from "@/lib/action-origin-policy";
import {reviewGates,parseDeletionReviewForm} from "@/lib/account-deletion-review-event-policy";
import {recordAccountDeletionReview} from "@/lib/account-deletion-review-event";

/** Review-routing audit only. Never approves erasure or touches financial data. */
export async function submitAccountDeletionReview(form:FormData){
 const admin=await requireAdmin();
 if(!reviewGates(process.env).canRecord)
  redirect("/admin/account-deletions?reviewError=disabled");
 const h=await headers();
 if(!isTrustedActionOrigin(h.get("origin"),h.get("host")))
  redirect("/admin/account-deletions?reviewError=origin");
 let outcome:"RECORDED"|"ALREADY_RECORDED";
 try{
  if(!await allowAttempt("account-deletion-audit",admin.id,6,60))
   throw Error("Rate limited");
  const parsed=parseDeletionReviewForm(form);
  outcome=await recordAccountDeletionReview({...parsed,operatorId:admin.id});
 }catch{
  redirect("/admin/account-deletions?reviewError=1");
 }
 revalidatePath("/admin/account-deletions");
 redirect("/admin/account-deletions?reviewOutcome="+outcome);
}
