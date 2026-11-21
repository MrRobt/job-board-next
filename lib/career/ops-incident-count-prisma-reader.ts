import {opsAlertQueryFilters} from "./ops-alert-policy";
import type {OpsIncidentCountReader} from "./ops-incident-scan-coordinator";

/** Read all three counts from one consistent InnoDB snapshot; never coerce
 * database errors, missing fields or partial results into zeroes. */
type CountQuery={where:unknown};
type CountDelegate=Readonly<{count(args:CountQuery):Promise<number>}>;
type ReadTransaction=Readonly<{
 toolRun:CountDelegate;
 toolRefundDispatch:CountDelegate;
}>;
export type OpsIncidentCountPrismaPort=Readonly<{
 $transaction<T>(callback:(tx:ReadTransaction)=>Promise<T>,options:{
  isolationLevel:"RepeatableRead";maxWait:number;timeout:number
 }):Promise<T>;
}>;

export function createPrismaOpsIncidentCountReader(db:OpsIncidentCountPrismaPort):OpsIncidentCountReader{
 return {
  readCompleteCounts(now){
   const filters=opsAlertQueryFilters(now);
   return db.$transaction(async tx=>{
    const staleReservations=await tx.toolRun.count({where:filters.staleReservations});
    const uncertainRefunds=await tx.toolRefundDispatch.count({where:filters.uncertainRefunds});
    const agedReadyRefunds=await tx.toolRefundDispatch.count({where:filters.agedReadyRefunds});
    return {staleReservations,uncertainRefunds,agedReadyRefunds};
   },{isolationLevel:"RepeatableRead",maxWait:10000,timeout:15000});
  }
 };
}
