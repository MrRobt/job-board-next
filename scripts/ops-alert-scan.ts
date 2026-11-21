/**
 * B04/B06 isolated read-only operations scan.
 * Emits aggregate counts only. ALERT exit 2; blocked/error exit 3.
 * No live merchant requests, no automated refunds, no credentials logged.
 */
import {PrismaClient} from "@prisma/client";
import {approvedOpsScanEnvironment,assessOpsAlerts,opsAlertQueryFilters} from "../lib/career/ops-alert-policy";

async function main(){
  if(!approvedOpsScanEnvironment(process.env)){
    console.error("Operational scan refused: explicit isolated read-only approval required");
    process.exitCode=3;
    return;
  }
  const db=new PrismaClient();
  try{
    const filters=opsAlertQueryFilters(new Date());
    const [staleReservations,uncertainRefunds,agedReadyRefunds]=await Promise.all([
      db.toolRun.count({where:filters.staleReservations}),
      db.toolRefundDispatch.count({where:filters.uncertainRefunds}),
      db.toolRefundDispatch.count({where:filters.agedReadyRefunds})
    ]);
    const result=assessOpsAlerts({staleReservations,uncertainRefunds,agedReadyRefunds});
    console.log(JSON.stringify({
      task:"B04_B06_READ_ONLY_OPS_ALERT",
      status:result.status,
      counts:result.counts,
      alerts:result.alerts,
      limitations:["Disposable test database only","Read-only aggregate signals","Requires manual investigation; no automated reversal"]
    }));
    if(result.status==="ALERT")process.exitCode=2;
  }catch{
    // Never print DB connection strings, identifiers, stack traces or sensitive inputs.
    console.error("Operational scan failed closed: database unreadable or unexpected query failure");
    process.exitCode=3;
  }finally{
    await db.$disconnect();
  }
}
void main();
