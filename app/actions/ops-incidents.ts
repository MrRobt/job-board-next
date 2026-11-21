"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {allowAttempt} from "@/lib/rate-limit";
import {parseOpsAckForm} from "@/lib/career/ops-ack-form";
import {acknowledgeOpsIncidentWithStore} from "@/lib/career/ops-incident-acknowledgment-service";
import {createPrismaOpsIncidentStore,type OpsPrismaClientPort} from "@/lib/career/ops-incident-prisma-store";

/**
 * Manual acknowledgment only. It neither refunds money nor notifies anyone.
 * Disabled until the target database's ninth migration has been verified.
 * No UI or route is exposed for this action in the current work package.
 */
export async function confirmOpsIncident(form:FormData){
 const admin=await requireAdmin();
 if(process.env.ENABLE_OPS_INCIDENT_ACK!=="true")
  redirect("/admin/incidents?incidentError=disabled");
 let outcome:"ACKNOWLEDGED"|"ALREADY_ACKNOWLEDGED";
 try{
  if(!await allowAttempt("ops-incident-acknowledge",admin.id,5,60))
   throw new Error("Ops acknowledgment rate limit");
  const command=parseOpsAckForm(form);
  outcome=await acknowledgeOpsIncidentWithStore(
   createPrismaOpsIncidentStore(db as unknown as OpsPrismaClientPort),
   {...command,operatorId:admin.id}
  );
 }catch{
  redirect("/admin/incidents?incidentError=1");
 }
 revalidatePath("/admin/incidents");
 redirect("/admin/incidents?incidentOutcome="+encodeURIComponent(outcome));
}
