/** Read-only operational alert policy. No refund, credit or payment mutations. */
export type OpsAlertCounts = Readonly<{
  staleReservations: number;
  uncertainRefunds: number;
  agedReadyRefunds: number;
}>;

export type OpsAlertStatus = "PASS" | "ALERT";

const safeCount=(count:number):number=>{
  if(!Number.isSafeInteger(count)||count<0)throw new Error("Invalid operational count");
  return count;
};

export function assessOpsAlerts(counts:OpsAlertCounts):{
  status:OpsAlertStatus;
  counts:OpsAlertCounts;
  alerts:ReadonlyArray<"STALE_AI_RESERVATIONS"|"REFUND_IN_DOUBT"|"REFUND_READY_AGED">;
}{
  const clean={
    staleReservations:safeCount(counts.staleReservations),
    uncertainRefunds:safeCount(counts.uncertainRefunds),
    agedReadyRefunds:safeCount(counts.agedReadyRefunds)
  };
  const alerts:("STALE_AI_RESERVATIONS"|"REFUND_IN_DOUBT"|"REFUND_READY_AGED")[]=[];
  if(clean.staleReservations>0)alerts.push("STALE_AI_RESERVATIONS");
  if(clean.uncertainRefunds>0)alerts.push("REFUND_IN_DOUBT");
  if(clean.agedReadyRefunds>0)alerts.push("REFUND_READY_AGED");
  return {status:alerts.length?"ALERT":"PASS",counts:clean,alerts};
}

/**
 * Query filters are shared by tests and the read-only CLI. A claimed refund
 * with missing claimedAt is inconsistent and must be flagged immediately,
 * rather than silently excluded by the older-than comparison.
 */
export function opsAlertQueryFilters(now:Date){
  if(!Number.isFinite(now.getTime()))throw new Error("Invalid scan time");
  return {
    staleReservations:{status:"RESERVED" as const,createdAt:{lt:new Date(now.getTime()-10*60_000)}},
    uncertainRefunds:{
      state:"IN_DOUBT" as const,
      OR:[{claimedAt:null},{claimedAt:{lt:new Date(now.getTime()-15*60_000)}}]
    },
    agedReadyRefunds:{state:"READY" as const,createdAt:{lt:new Date(now.getTime()-30*60_000)}}
  };
}

/** Only inspect the historical dedicated disposable MySQL test DB in this phase. */
export function approvedOpsScanEnvironment(env:Readonly<Record<string,string|undefined>>):boolean{
  if(env.OPS_ALERT_READ_ONLY_APPROVED!=="true"||
     env.INTEGRATION_TEST_DATABASE!=="true"||env.NODE_ENV==="production")return false;
  try{
    const url=new URL(env.DATABASE_URL??"");
    return url.protocol==="mysql:"&&
      (url.hostname==="127.0.0.1"||url.hostname==="localhost")&&url.port==="3306"&&
      /^\/jobs_mvp_migrate_[0-9]{8}_[a-z0-9]+$/.test(url.pathname)&&
      !url.search&&!url.hash;
  }catch{return false;}
}
