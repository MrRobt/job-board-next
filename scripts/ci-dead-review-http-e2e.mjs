#!/usr/bin/env node
/** Ephemeral localhost HTTP/session/CSRF E2E against CI's fresh MySQL ONLY.
 * Requires explicit integration gate and both review flags. Never sends anything.
 */
import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {PrismaClient} from "@prisma/client";

assert.equal(process.env.CI,"true","CI-only HTTP security integration");
assert.equal(process.env.INTEGRATION_TEST_DATABASE,"true","Isolated DB required");
assert.equal(process.env.ENABLE_OPS_DEAD_REVIEW_READ,"true");
assert.equal(process.env.ENABLE_OPS_DEAD_REVIEW_WRITE,"true");
assert.equal(process.env.ENABLE_REAL_PAYMENT,"false");
assert.equal(process.env.ENABLE_LIVE_AI,"false");

const port=process.env.DEAD_REVIEW_HTTP_PORT??"3101";
assert.match(port,/^[1-9][0-9]{0,4}$/);
const origin=`http://127.0.0.1:${port}`;
const db=new PrismaClient();
const incidentKey="STALE_AI_RESERVATIONS";
const intentKey=createHash("sha256").update(randomUUID()).digest("hex");
const users=[];
const tokenByRole=new Map();
let ownsIncident=false,ownsIntent=false;

const request=async(path,{cookie,method="GET",body,originHeader}={})=>fetch(origin+path,{
 method,redirect:"manual",
 headers:{...(cookie?{cookie:`job_session=${cookie}`}:{}),
  ...(originHeader!==undefined?{origin:originHeader}:{}),
 }, // Fetch sets the multipart boundary for real React Server Action form data.
 body,signal:AbortSignal.timeout(12000)
});
const location=(response)=>new URL(response.headers.get("location")??"/",origin);
async function countReviews(){return db.opsNotificationDeadReview.count({where:{intentKey}})}
async function setup(){
 if(await db.opsAlertIncident.count({where:{key:incidentKey}})>0)
  throw Error("Refuse existing incident; cannot safely seed HTTP E2E");
 if(await db.opsIncidentNotificationIntent.count({where:{incidentKey}})>0)
  throw Error("Refuse existing notification intent");
 const stamp=new Date();
 const incident=await db.opsAlertIncident.create({data:{
  key:incidentKey,state:"OPEN",count:1,openedAt:stamp,lastSeenAt:stamp
 }});
 ownsIncident=true;
 await db.opsIncidentNotificationIntent.create({data:{
  idempotencyKey:intentKey,incidentKey:incident.key,episodeOpenedAt:stamp,
  kind:"NOTIFY",priority:"HIGH",dueBucket:1,count:1,state:"DEAD",
  attemptCount:5,failureCode:"RETRY_EXHAUSTED"
 }});
 ownsIntent=true;
 for(const role of ["ADMIN","USER"]){
  const user=await db.user.create({data:{
   email:`${randomUUID()}-dead-e2e@example.invalid`,passwordHash:"not-a-login",role
  }});
  users.push(user.id);
  const token=randomBytes(32).toString("hex");
  await db.session.create({data:{
   tokenHash:createHash("sha256").update(token).digest("hex"),userId:user.id,
   expiresAt:new Date(Date.now()+600_000)
  }});
  tokenByRole.set(role,token);
 }
}
async function run(){
 let ready=false;
 for(let i=0;i<35;i++){
  try{const response=await request("/");await response.body?.cancel();
   if(response.status===200){ready=true;break}}catch{}
  await sleep(1000);
 }
 assert.ok(ready,"Isolated server not ready");
 let response=await request("/admin/dead-notifications");
 assert.ok([307,308].includes(response.status),"Anonymous must redirect");
 assert.equal(location(response).pathname,"/login");await response.body?.cancel();
 response=await request("/admin/dead-notifications",{cookie:tokenByRole.get("USER")});
 assert.ok([307,308].includes(response.status),"Regular user must redirect");
 assert.equal(location(response).pathname,"/");await response.body?.cancel();
 response=await request("/admin/dead-notifications",{cookie:tokenByRole.get("ADMIN")});
 assert.equal(response.status,200,"Admin must see review page");
 const html=await response.text();
 assert.ok(html.includes("终止通知任务复核"),"Admin heading missing");
 assert.ok(html.includes(intentKey.slice(0,12)),"Owned DEAD task not visible");
 // The full key is intentionally present only as a hidden POST field; the visible table truncates it.
 // React Server Actions expose the action ID in a hidden form field.
 const actionId=html.match(/name="(\$ACTION_ID_[a-zA-Z0-9]+)"/)?.[1];
 assert.ok(actionId,"No real Server Action ID found in admin HTML");
 const form=()=>{
  const value=new FormData();
  value.set(actionId,"");
  value.set("key",intentKey);
  value.set("confirmed","yes");
  value.set("reasonCode","REVIEWED_NO_REQUEUE");
  return value;
 };
 const post=(cookie,originHeader,body=form())=>request("/admin/dead-notifications",{
  cookie,method:"POST",body,originHeader
 });
 const checks=[];
 response=await post(tokenByRole.get("ADMIN"),"https://attacker.invalid");
 assert.ok(response.status>=400||
  ([303,307,308].includes(response.status)&&location(response).searchParams.get("reviewError")==="origin"),
  `Cross-origin POST must be rejected, got HTTP ${response.status} ${response.headers.get("location")}`);
 await response.body?.cancel();
 assert.equal(await countReviews(),0,"Cross-origin must not write");
 checks.push("cross-origin blocked");
 response=await post(tokenByRole.get("ADMIN"),undefined);
 assert.notEqual(location(response).searchParams.get("reviewOutcome"),"REVIEWED");
 await response.body?.cancel();
 assert.equal(await countReviews(),0,"Missing Origin must not write");
 checks.push("missing-origin blocked");
 response=await post(tokenByRole.get("USER"),origin);
 assert.ok([303,307,308].includes(response.status),`Regular user POST must redirect, got ${response.status}`);
 assert.equal(location(response).pathname,"/","Regular user action cannot reach admin flow");
 await response.body?.cancel();
 assert.equal(await countReviews(),0,"Regular user must not write");
 checks.push("user POST blocked");
 response=await post(tokenByRole.get("ADMIN"),origin);
 assert.ok([303,307,308].includes(response.status),`Admin action POST unexpected ${response.status}`);
 assert.equal(location(response).searchParams.get("reviewOutcome"),"REVIEWED");
 await response.body?.cancel();
 assert.equal(await countReviews(),1,"Admin review must write once");
 checks.push("admin POST reviewed once");
 response=await post(tokenByRole.get("ADMIN"),origin);
 assert.equal(location(response).searchParams.get("reviewOutcome"),"ALREADY_REVIEWED");
 await response.body?.cancel();
 assert.equal(await countReviews(),1,"Replay must remain one record");
 checks.push("idempotent replay");
 const changed=form();
 changed.set("reasonCode","NEEDS_OFFLINE_INVESTIGATION");
 response=await post(tokenByRole.get("ADMIN"),origin,changed);
 assert.equal(location(response).searchParams.get("reviewError"),"1","Conflicting decision must be rejected");
 await response.body?.cancel();
 assert.equal(await countReviews(),1,"Conflict must leave first review intact");
 const state=await db.opsIncidentNotificationIntent.findUniqueOrThrow({where:{idempotencyKey:intentKey}});
 assert.equal(state.state,"DEAD","Review must never reactivate task");
 checks.push("conflict blocked and DEAD retained");
 console.log(JSON.stringify({scope:"CI_LOCALHOST_SESSION_HTTP",pass:checks.length+3,fail:0,checks:[
  "anonymous GET rejected","USER GET rejected","ADMIN GET rendered",...checks
 ],noNotification:true,noPayment:true,noAi:true}));
}
async function cleanup(){
 if(ownsIntent){
  await db.opsNotificationDeadReview.deleteMany({where:{intentKey}});
  await db.opsIncidentNotificationIntent.deleteMany({where:{idempotencyKey:intentKey}});
 }
 if(ownsIncident)await db.opsAlertIncident.deleteMany({where:{key:incidentKey}});
 if(users.length)await db.user.deleteMany({where:{id:{in:users}}});
 await db.$disconnect();
}
try{
 await setup();await run();
}catch(error){console.error("DEAD REVIEW HTTP E2E FAILED",error);process.exitCode=1}
finally{try{await cleanup()}catch(error){console.error("E2E cleanup failed",error);process.exitCode=1}}
