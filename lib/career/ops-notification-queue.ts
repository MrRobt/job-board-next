import {assertOpsIncidentKey} from "./ops-incident-policy";
import {opsNotificationIdempotencyKey,type OpsNotificationIntent} from "./ops-notification-intents";

/** Manual/internal-only durable staging; no dispatcher or external delivery. */
type IncidentRow=Readonly<{state:"OPEN"|"ACKNOWLEDGED"|"RESOLVED";openedAt:Date;count:number}>;
export type OpsNotificationQueueTx=Readonly<{
 findIncident(key:OpsNotificationIntent["key"]):Promise<IncidentRow|null>;
 insertOnce(intent:OpsNotificationIntent):Promise<number>;
}>;
export type OpsNotificationQueueStore=Readonly<{
 transaction<T>(fn:(tx:OpsNotificationQueueTx)=>Promise<T>):Promise<T>;
}>;
export type OpsNotificationQueueResult="QUEUED"|"EXISTS"|"STALE";

export async function queueInitialOpsNotificationIntent(
 store:OpsNotificationQueueStore,intent:OpsNotificationIntent,now:Date
):Promise<OpsNotificationQueueResult>{
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw new Error("Invalid notification clock");
 assertOpsIncidentKey(intent?.key);
 if(intent.kind!=="NOTIFY"||intent.dueBucket!==0||
   !Number.isSafeInteger(intent.count)||intent.count<=0||
   !(intent.incidentOpenedAt instanceof Date)||
   !Number.isFinite(intent.incidentOpenedAt.getTime())||
   intent.incidentOpenedAt.getTime()>now.getTime()||
   intent.idempotencyKey!==opsNotificationIdempotencyKey(
    intent.key,intent.incidentOpenedAt,"NOTIFY",0)||
   intent.priority!==(intent.key==="REFUND_IN_DOUBT"?"CRITICAL":"HIGH"))
  throw new Error("Invalid initial notification intent");
 return store.transaction(async tx=>{
  const current=await tx.findIncident(intent.key);
  if(!current||current.state!=="OPEN"||current.count===0||
    current.openedAt.getTime()!==intent.incidentOpenedAt.getTime())return "STALE";
  const count=await tx.insertOnce(intent);
  if(count!==0&&count!==1)throw new Error("Invalid notification insert count");
  return count===1?"QUEUED":"EXISTS";
 });
}
