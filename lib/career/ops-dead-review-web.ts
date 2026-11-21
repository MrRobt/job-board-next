/** Separate read-only visibility and review mutation gates.
 * Only the exact literal "true" enables either; no dispatch path exists.
 */
export function deadNotificationReviewGates(env:Readonly<Record<string,string|undefined>>){
 const canRead=env.ENABLE_OPS_DEAD_REVIEW_READ==="true";
 return {canRead,canReview:canRead&&env.ENABLE_OPS_DEAD_REVIEW_WRITE==="true"};
}

/** Fail closed for unsafe requests with absent or mismatched Origin.
 * Server Actions also apply Next.js built-in origin/host validation.
 */
export function isTrustedDeadReviewOrigin(origin:string|null,host:string|null):boolean{
 if(!origin||!host||host.length>253||!/^[a-zA-Z0-9.:-]+$/.test(host))return false;
 try{
  const parsed=new URL(origin);
  if(parsed.protocol!=="https:"&&parsed.protocol!=="http:")return false;
  if(parsed.username||parsed.password||parsed.pathname!=="/"||parsed.search||parsed.hash)return false;
  return parsed.host.toLowerCase()===host.toLowerCase();
 }catch{return false}
}

/** Whitelist input; never accept operator ID, role, token or free-form notes. */
export function parseDeadReviewForm(form:FormData){
 for(const name of ["confirmed","key","reasonCode"]){
  if(form.getAll(name).length!==1)throw Error("Missing or duplicate review field");
 }
 if(form.get("confirmed")!=="yes")throw Error("Explicit dead review confirmation required");
 const key=form.get("key"),reasonCode=form.get("reasonCode");
 if(typeof key!=="string"||!/^[a-f0-9]{64}$/.test(key))throw Error("Invalid dead review key");
 if(reasonCode!=="REVIEWED_NO_REQUEUE"&&reasonCode!=="NEEDS_OFFLINE_INVESTIGATION")
  throw Error("Invalid dead review reason");
 return {key,reasonCode};
}
