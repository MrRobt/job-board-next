/**
 * B04/B06 isolated manual incident scan.
 * Persists only OpsAlertIncident and OpsAlertIncidentEvent; NO notification
 * queue, external delivery, payment, refund, or AI usage mutation.
 * Approved dedicated disposable MySQL migration DB ONLY.
 */
import {PrismaClient} from "@prisma/client";
import {countRefundLedgerReviewHolds} from "../lib/career/refund-review-ops-read";
import {
 approvedRefundReviewIncidentSyncEnvironment,runIsolatedRefundReviewIncidentScan
} from "../lib/career/refund-review-incident-scan";
import {createPrismaOpsIncidentSyncStore,type OpsIncidentSyncPrismaPort} from "../lib/career/ops-incident-sync-prisma-store";

async function main(){
 if(!approvedRefundReviewIncidentSyncEnvironment(process.env)){
  console.error("Refund review incident scan refused: independent isolated write approval required");
  process.exitCode=3;
  return;
 }
 const db=new PrismaClient();
 try{
  const store=createPrismaOpsIncidentSyncStore(db as unknown as OpsIncidentSyncPrismaPort);
  const result=await runIsolatedRefundReviewIncidentScan(
   process.env,{readActiveHolds:()=>countRefundLedgerReviewHolds(db)},store,new Date()
  );
  console.log(JSON.stringify({
   task:"B04_REFUND_LEDGER_REVIEW_INCIDENT_SYNC",
   key:result.key,state:result.state,event:result.event,count:result.count,
   externalNotification:false,financialMutation:false,
   note:"Disposable DB incident ledger only; human review is still required"
  }));
  if(result.count>0)process.exitCode=2;
 }catch{
  // No credentials, SQL, identifiers, or raw error text in logs.
  console.error("Refund review incident scan failed closed; investigate isolated database");
  process.exitCode=3;
 }finally{
  await db.$disconnect();
 }
}
void main();
