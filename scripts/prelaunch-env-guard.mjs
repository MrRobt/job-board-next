#!/usr/bin/env node
/**
 * D02 prelaunch environment guard. Pure, local, read-only configuration checks.
 * This tool never starts a server, accesses the DB, calls an external service
 * or prints values from the environment.
 */
import {isIP} from "node:net";
import {pathToFileURL} from "node:url";

export const offFlags=[
 "ENABLE_REAL_PAYMENT","ENABLE_TOOL_PAYMENTS","TOOL_PAYMENT_APPROVED",
 "ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI","AI_COMPLIANCE_APPROVED",
 "ENABLE_PAYMENT_RECONCILIATION","ENABLE_REFUND_QUERY",
 "ENABLE_REFUND_DISPATCH_CLAIM","ENABLE_REFUND_SEND",
 // Operational incident acknowledgment, dead-letter review, and incident
 // synchronization mutate state and need separate authorization before release.
 "ENABLE_OPS_INCIDENT_ACK","ENABLE_OPS_DEAD_REVIEW_WRITE",
 "OPS_INCIDENT_SYNC_APPROVED",
  // External mail delivery also needs explicit provider/privacy authorization.
  "ENABLE_EMAIL_VERIFICATION_DELIVERY"
];

function publicOriginAllowed(raw){
 if(typeof raw!=="string"||!raw||raw!==raw.trim()||raw.length>253)return false;
 try{
  const u=new URL(raw);
  const host=u.hostname.toLowerCase(),labels=host.split(".");
  if(u.protocol!=="https:"||u.port||u.username||u.password||
     u.pathname!=="/"||u.search||u.hash||isIP(host)!==0||
     labels.length<2||host.endsWith(".")||raw!==u.origin&&raw!==u.origin+"/")
   return false;
  if(labels.some(s=>s.length<1||s.length>63||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)))return false;
  if(!/[a-z]/.test(labels.at(-1)))return false;
  if(["localhost","local","internal","lan","test","invalid","example",
      "onion","arpa","home"].includes(labels.at(-1)))return false;
  return true;
 }catch{return false;}
}
function localOriginAllowed(raw){
 if(!raw)return true;
 try{
  const u=new URL(raw);
  return u.protocol==="http:"&&
    ["127.0.0.1","localhost","[::1]"].includes(u.hostname)&&
    !u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==="/"&&
    raw===u.origin;
 }catch{return false;}
}

/** Returns identifiers only, never the original value of an env variable. */
export function evaluatePrelaunchConfig(e){
 const failures=[];
 const mode=e.DJS_PRELAUNCH_MODE;
 if(!["LOCAL_PREVIEW","PUBLIC_PRELAUNCH"].includes(mode)){
  failures.push("DJS_PRELAUNCH_MODE");
 }
 for(const key of offFlags){
  if(e[key]!==undefined&&e[key]!=="false"&&e[key]!==""){
   failures.push(key);
  }
 }
 if(mode==="PUBLIC_PRELAUNCH"){
  if(e.NODE_ENV!=="production")failures.push("NODE_ENV");
  if(!publicOriginAllowed(e.APP_ORIGIN))failures.push("APP_ORIGIN");
  if(!["x-real-ip","cf-connecting-ip"].includes(e.TRUSTED_CLIENT_IP_HEADER))
   failures.push("TRUSTED_CLIENT_IP_HEADER");
 }else if(mode==="LOCAL_PREVIEW"){
  if(e.NODE_ENV==="production")failures.push("NODE_ENV");
  if(!localOriginAllowed(e.APP_ORIGIN))failures.push("APP_ORIGIN");
 }
 return {mode:["LOCAL_PREVIEW","PUBLIC_PRELAUNCH"].includes(mode)?mode:"UNSPECIFIED",
  status:failures.length?"BLOCKED":"PASS",violations:failures,
  limitations:[
   "This is configuration validation only; no merchant, model or database access",
   "Does not authorize public release or switch on any real payment/AI feature",
   "TLS, reverse-proxy header overwrite and direct-origin firewall need separate verification",
   "External approvals, production migration, CI, E2E and backup restore are not validated"
  ]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=evaluatePrelaunchConfig(process.env);
 console.log(JSON.stringify(result,null,2));
 if(result.status!=="PASS")process.exitCode=2;
}
