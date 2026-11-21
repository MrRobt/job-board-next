import {assessOpsAlerts,opsAlertQueryFilters,approvedOpsScanEnvironment,type OpsAlertCounts} from "./ops-alert-policy";
import {syncOpsAlertScanWithStore,type OpsIncidentSyncStore,type OpsIncidentSyncResult} from "./ops-incident-sync-service";

/** A complete scan snapshot. The adapter must read all three counters from the
 * same consistent DB snapshot, not issue unrelated queries with different clocks.
 */
export type OpsIncidentCountReader=Readonly<{
 readCompleteCounts(now:Date):Promise<OpsAlertCounts>;
}>;

/** Extra write boundary. The read-only scan approval NEVER authorizes writes.
 * No production, remote DB, public route, scheduler or background worker.
 */
export function approvedOpsIncidentSyncEnvironment(env:Readonly<Record<string,string|undefined>>):boolean{
 return approvedOpsScanEnvironment(env)&&env.OPS_INCIDENT_SYNC_APPROVED==="true";
}

export async function runIsolatedOpsIncidentScan(
 env:Readonly<Record<string,string|undefined>>,
 reader:OpsIncidentCountReader,
 store:OpsIncidentSyncStore,
 now:Date
):Promise<readonly OpsIncidentSyncResult[]>{
 if(!approvedOpsIncidentSyncEnvironment(env))
  throw new Error("Incident sync refused: isolated explicit approval required");
 opsAlertQueryFilters(now); // Reject invalid observation clock before any IO.
 // Missing / partial / rejected aggregate queries must NEVER resolve incidents.
 const counts=assessOpsAlerts(await reader.readCompleteCounts(now)).counts;
 return syncOpsAlertScanWithStore(store,counts,now);
}
