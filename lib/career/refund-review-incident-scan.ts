import {approvedOpsIncidentSyncEnvironment} from "./ops-incident-scan-coordinator";
import {syncOpsIncidentWithStore,type OpsIncidentSyncResult,type OpsIncidentSyncStore} from "./ops-incident-sync-service";

/** Isolated/manual audit-to-incident bridge. No HTTP route, cron, outbound delivery
 * or financial mutation is wired here. Read approval alone never authorizes writes.
 */
export type RefundReviewIncidentCountReader=Readonly<{
 readActiveHolds():Promise<number>;
}>;

/** Third explicit gate in addition to read approval and incident-sync approval. */
export function approvedRefundReviewIncidentSyncEnvironment(
 env:Readonly<Record<string,string|undefined>>
):boolean{
 return env.OPS_REFUND_LEDGER_SYNC_APPROVED==="true"&&
  approvedOpsIncidentSyncEnvironment(env);
}

/** Fail closed on partial count, DB failure, stale scan time or CAS conflicts. */
export async function runIsolatedRefundReviewIncidentScan(
 env:Readonly<Record<string,string|undefined>>,
 reader:RefundReviewIncidentCountReader,
 store:OpsIncidentSyncStore,
 now:Date
):Promise<OpsIncidentSyncResult>{
 if(!approvedRefundReviewIncidentSyncEnvironment(env))
  throw Error("Refund review incident sync refused: isolated explicit approval required");
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("Invalid refund review scan time");
 const count=await reader.readActiveHolds();
 if(!Number.isSafeInteger(count)||count<0)
  throw Error("Invalid refund review incident count");
 return syncOpsIncidentWithStore(store,"REFUND_LEDGER_REVIEW",count,now);
}
