/** Internal-only failure disposition; no external delivery or retries are scheduled here. */
export type OpsNotificationFailureRow=Readonly<{
 idempotencyKey:string;state:"QUEUED"|"CLAIMED"|"RETRY_WAIT"|"DEAD";
 claimToken:string|null;leaseExpiresAt:Date|null;attemptCount:number;
}>;
export type OpsNotificationFailureTx=Readonly<{
 read(key:string):Promise<OpsNotificationFailureRow|null>;
 compareAndSet(previous:OpsNotificationFailureRow,update:{
  state:"RETRY_WAIT"|"DEAD";claimToken:null;claimedAt:null;leaseExpiresAt:null;
  nextAttemptAt:Date|null;failureCode:string
 }):Promise<number>;
}>;
export type OpsNotificationFailureStore=Readonly<{
 transaction<T>(fn:(tx:OpsNotificationFailureTx)=>Promise<T>):Promise<T>;
}>;
export type OpsNotificationFailureResult=
 |Readonly<{status:"RETRY_WAIT";nextAttemptAt:Date}>
 |Readonly<{status:"DEAD"|"MISSING"|"FENCED"|"EXPIRED"|"CONFLICT"}>;

const validToken=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const safeCode=/^[A-Z][A-Z0-9_]{1,39}$/;
export async function failOpsNotificationClaim(
 store:OpsNotificationFailureStore,key:string,claimToken:string,failureCode:string,now:Date
):Promise<OpsNotificationFailureResult>{
 if(!/^[a-f0-9]{64}$/.test(key)||!validToken(claimToken)||
  !safeCode.test(failureCode)||!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("Invalid notification failure request");
 return store.transaction(async tx=>{
  const previous=await tx.read(key);
  if(!previous)return {status:"MISSING"};
  if(previous.idempotencyKey!==key||!Number.isSafeInteger(previous.attemptCount)||
   previous.attemptCount<1||previous.attemptCount>5)
   throw Error("Invalid notification failure row");
  if(previous.state!=="CLAIMED"||previous.claimToken!==claimToken)return {status:"FENCED"};
  if(!(previous.leaseExpiresAt instanceof Date)||!Number.isFinite(previous.leaseExpiresAt.getTime()))
   throw Error("Invalid notification lease");
  if(previous.leaseExpiresAt.getTime()<=now.getTime())return {status:"EXPIRED"};
  // Exponential retry with fixed upper bound; never pretend a message was delivered.
  const dead=previous.attemptCount>=5;
  const nextAttemptAt=dead?null:new Date(now.getTime()+Math.min(60,2**previous.attemptCount)*60_000);
  const count=await tx.compareAndSet(previous,{
   state:dead?"DEAD":"RETRY_WAIT",claimToken:null,claimedAt:null,leaseExpiresAt:null,
   nextAttemptAt,failureCode
  });
  if(count!==1)return {status:"CONFLICT"};
  return dead?{status:"DEAD"}:{status:"RETRY_WAIT",nextAttemptAt:nextAttemptAt!};
 });
}
