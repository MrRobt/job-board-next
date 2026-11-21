"use server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {allowAttempt} from "@/lib/rate-limit";
import {reviewDeadOpsNotification} from "@/lib/career/ops-notification-dead-review";
import {createPrismaDeadReviewStore,type DeadReviewPrismaPort} from "@/lib/career/ops-notification-dead-review-prisma-store";
import {deadNotificationReviewGates,isTrustedDeadReviewOrigin,parseDeadReviewForm} from "@/lib/career/ops-dead-review-web";

/** Manual-only audit. Never unblocks an outbox intent or sends a notification. */
export async function submitDeadNotificationReview(form:FormData){
 const admin=await requireAdmin();
 const gates=deadNotificationReviewGates(process.env);
 if(!gates.canReview)redirect("/admin/dead-notifications?reviewError=disabled");
 const h=await headers();
 if(!isTrustedDeadReviewOrigin(h.get("origin"),h.get("host")))
  redirect("/admin/dead-notifications?reviewError=origin");
 let result:"REVIEWED"|"ALREADY_REVIEWED"|"NOT_DEAD";
 try{
  if(!await allowAttempt("ops-dead-review",admin.id,4,60))
   throw Error("Dead review rate limit");
  const parsed=parseDeadReviewForm(form);
  result=await reviewDeadOpsNotification(
   createPrismaDeadReviewStore(db as unknown as DeadReviewPrismaPort),
   {...parsed,operatorId:admin.id},new Date()
  );
 }catch{
  redirect("/admin/dead-notifications?reviewError=1");
 }
 revalidatePath("/admin/dead-notifications");
 redirect("/admin/dead-notifications?reviewOutcome="+encodeURIComponent(result));
}
