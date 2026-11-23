#!/usr/bin/env node
/** CI-only genuine Next.js HTTP flow against a fresh isolated MySQL database. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHash,scryptSync} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {PrismaClient} from "@prisma/client";

assert.equal(process.env.CI,"true","CI-only HTTP");
assert.equal(process.env.INTEGRATION_TEST_DATABASE,"true","Disposable DB required");
assert.equal(process.env.ENABLE_REAL_PAYMENT,"false");
assert.equal(process.env.ENABLE_LIVE_AI,"false");
assert.equal(process.env.ENABLE_PASSWORD_RESET_DELIVERY,"false");
assert.equal(process.env.ENABLE_EMAIL_VERIFICATION_DELIVERY,"false");

const port=process.env.PASSWORD_RESET_HTTP_PORT??"3102";
assert.match(port,/^[1-9][0-9]{0,4}$/);
const origin="http://127.0.0.1:"+port;
const db=new PrismaClient();
const ownUsers=[];
const candidate=randomBytes(32).toString("hex");
const candidateDigest=createHash("sha256").update(candidate).digest("hex");
const sessionCookie=randomBytes(32).toString("hex");
const sessionDigest=createHash("sha256").update(sessionCookie).digest("hex");
const newInput=["New","Synthetic","Account","2026"].join("-");
let userId=null;

const request=(path,{cookie,method="GET",body,originHeader}={})=>fetch(origin+path,{
 method,redirect:"manual",
 headers:{
  "x-real-ip":"203.0.113.42",
  ...(cookie?{cookie:"job_session="+cookie}:{}),
  ...(originHeader!==undefined?{origin:originHeader}:{})
 },
 body,signal:AbortSignal.timeout(12000)
});
const location=(response)=>new URL(response.headers.get("location")??"/",origin);
const actionId=(html,indicator)=>{
 const matching=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
  .map(match=>match[1]).find(inner=>inner.includes(indicator));
 assert.ok(matching,"Expected reset-specific form missing");
 const id=matching.match(/name="(\$ACTION_ID_[a-zA-Z0-9]+)"/)?.[1];
 assert.ok(id,"Expected reset-specific Server Action missing");
 return id;
};
const digestMatches=(plain,stored)=>{
 const parts=stored.split(":");
 return parts.length===2&&scryptSync(plain,parts[0],64).toString("hex")===parts[1];
};
async function seed(){
 const user=await db.user.create({data:{
  email:"u01-http-"+randomUUID()+"@example.invalid",
  passwordHash:"placeholder",emailVerifiedAt:new Date()
 }});
 userId=user.id;ownUsers.push(user.id);
 await db.passwordResetToken.create({data:{
  userId:user.id,tokenHash:candidateDigest,expiresAt:new Date(Date.now()+600000)
 }});
 await db.session.create({data:{
  userId:user.id,tokenHash:sessionDigest,expiresAt:new Date(Date.now()+600000)
 }});
}

async function run(){
 let ready=false;
 for(let attempt=0;attempt<35;attempt++){
  try{
   const response=await request("/forgot-password");
   if(response.status===200){await response.body?.cancel();ready=true;break;}
   await response.body?.cancel();
  }catch{}
  await sleep(1000);
 }
 assert.ok(ready,"Isolated recovery HTTP server not ready");
 let response=await request("/forgot-password");
 assert.equal(response.status,200);
 const forgotHtml=await response.text();
 const forgotActionId=actionId(forgotHtml,'name="email"');
 const requestForm=(email)=>{
  const form=new FormData();
  form.set(forgotActionId,"");
  form.set("email",email);
  return form;
 };
 response=await request("/forgot-password",{
  method:"POST",body:requestForm("unknown@example.invalid"),originHeader:"https://attacker.invalid"
 });
 await response.body?.cancel();
 assert.equal(await db.passwordResetToken.count({where:{userId}}),1);
 response=await request("/forgot-password",{
  method:"POST",body:requestForm("unknown@example.invalid"),originHeader:origin
 });
 await response.body?.cancel();
 assert.equal(await db.passwordResetToken.count({where:{userId}}),1);

 response=await request("/reset-password?token="+candidate);
 assert.equal(response.status,200);
 const resetHtml=await response.text();
 const resetActionId=actionId(resetHtml,'name="newPassword"');
 assert.ok(resetHtml.includes(candidate),"GET should render hidden action token");
 assert.equal(await db.passwordResetToken.count({where:{userId}}),1,"GET cannot consume");
 const resetForm=(value=candidate)=>{
  const form=new FormData();
  form.set(resetActionId,"");
  form.set("token",value);
  form.set("newPassword",newInput);
  return form;
 };

 response=await request("/reset-password",{
  method:"POST",body:resetForm(),originHeader:"https://attacker.invalid"
 });
 await response.body?.cancel();
 assert.equal(await db.passwordResetToken.count({where:{userId}}),1,"Cross-origin must not consume");
 assert.equal(await db.session.count({where:{userId}}),1,"Cross-origin must not invalidate a session");

 response=await request("/reset-password",{
  method:"POST",body:resetForm()
 });
 await response.body?.cancel();
 assert.equal(await db.passwordResetToken.count({where:{userId}}),1,"Missing Origin must not consume");

 response=await request("/reset-password",{
  method:"POST",body:resetForm(),originHeader:origin
 });
 assert.ok([303,307,308].includes(response.status),"Valid reset must redirect");
 assert.equal(location(response).pathname,"/login");
 assert.equal(location(response).searchParams.get("reset"),"1");
 await response.body?.cancel();
 const account=await db.user.findUniqueOrThrow({where:{id:userId}});
 assert.notEqual(account.passwordHash,"placeholder");
 assert.equal(digestMatches(newInput,account.passwordHash),true);
 assert.equal(await db.passwordResetToken.count({where:{userId}}),0);
 assert.equal(await db.session.count({where:{userId}}),0,"Reset revokes all previous sessions");

 response=await request("/reset-password",{
  method:"POST",body:resetForm(),originHeader:origin
 });
 assert.ok([303,307,308].includes(response.status),"Replay must redirect");
 assert.equal(location(response).pathname,"/reset-password");
 await response.body?.cancel();
 assert.equal(await db.session.count({where:{userId}}),0);
 response=await request("/account",{cookie:sessionCookie});
 assert.ok([307,308].includes(response.status));
 assert.equal(location(response).pathname,"/login");
 await response.body?.cancel();
 console.log(JSON.stringify({scope:"CI_PASSWORD_RESET_HTTP",pass:10,fail:0,
  checks:["forgot GET","cross-origin request blocked","mail disabled","reset GET read-only",
   "cross-origin confirm blocked","missing-origin confirm blocked","valid POST once",
   "password changed","sessions revoked","replay/old-cookie rejected"],
  noMail:true,noPayment:true,noAi:true}));
}

async function cleanup(){
 if(ownUsers.length)await db.user.deleteMany({where:{id:{in:ownUsers}}});
 await db.$disconnect();
}
try{await seed();await run();}
catch(error){console.error("U01 RESET HTTP E2E FAILED",error);process.exitCode=1;}
finally{try{await cleanup();}catch(error){console.error("E2E cleanup failed",error);process.exitCode=1;}}
