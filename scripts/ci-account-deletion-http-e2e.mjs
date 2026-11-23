#!/usr/bin/env node
/** Disposable HTTP U01 closure-request test: no real users or external calls. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID,scryptSync} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {PrismaClient} from "@prisma/client";

assert.equal(process.env.CI,"true","CI only");
assert.equal(process.env.INTEGRATION_TEST_DATABASE,"true","Disposable database required");
assert.match(process.env.DATABASE_URL??"",/\/account_deletion_http_ci$/);
for(const env of ["ENABLE_REAL_PAYMENT","ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI",
 "ENABLE_TOOL_PAYMENTS","ENABLE_EMAIL_VERIFICATION_DELIVERY","ENABLE_PASSWORD_RESET_DELIVERY"]){
 assert.equal(process.env[env],"false",env);
}

const port=process.env.ACCOUNT_DELETION_HTTP_PORT??"3104";
assert.match(port,/^[1-9][0-9]{0,4}$/);
const origin="http://127.0.0.1:"+port;
const db=new PrismaClient();
const ids=[];
let ownId=null;
let otherId=null;
let orderId=null;
let cookie=null;
const currentPassword=["Account","Closure","Synthetic","2026"].join("-");
const salt=randomBytes(16).toString("hex");
const passwordHash=salt+":"+scryptSync(currentPassword,salt,64).toString("hex");

const request=(path,{method="GET",body,originHeader,cookieValue}={})=>fetch(origin+path,{
 method,redirect:"manual",body,
 headers:{
  "x-real-ip":"203.0.113.46",
  ...(originHeader!==undefined?{origin:originHeader}:{}),
  ...(cookieValue?{cookie:"job_session="+cookieValue}:{})
 },
 signal:AbortSignal.timeout(15000)
});
const location=(response)=>new URL(response.headers.get("location")??"/",origin);
const actionId=(html,field)=>{
 const fragment=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
  .map(x=>x[1]).find(s=>s.includes(field));
 assert.ok(fragment,"Expected action form missing: "+field);
 const name=fragment.match(/name="(\$ACTION_ID_[a-zA-Z0-9]+)"/)?.[1];
 assert.ok(name,"Server Action ID missing: "+field);
 return name;
};
const form=(id,fields)=>{
 const f=new FormData();
 f.set(id,"");
 for(const [k,v]of Object.entries(fields))f.set(k,v);
 return f;
};
async function seed(){
 const first=await db.user.create({data:{
  email:"u01-http-deletion-"+randomUUID()+"@example.invalid",
  passwordHash,emailVerifiedAt:new Date()
 }});
 ownId=first.id;ids.push(ownId);
 const other=await db.user.create({data:{
  email:"u01-http-untouched-"+randomUUID()+"@example.invalid",
  passwordHash:"placeholder",emailVerifiedAt:new Date()
 }});
 otherId=other.id;ids.push(otherId);
 orderId=randomUUID().replace(/-/g,"").slice(0,32);
 await db.toolOrder.create({data:{
  id:orderId,userId:ownId,sku:"STARTER20",amountFen:990,
  credits:20,provider:"MOCK",status:"PAID"
 }});
 return first.email;
}

async function run(email){
 let ready=false;
 for(let i=0;i<40;i++){
  try{
   const response=await request("/login");
   if(response.status===200){await response.body?.cancel();ready=true;break;}
   await response.body?.cancel();
  }catch{}
  await sleep(1000);
 }
 assert.ok(ready,"Isolated localhost HTTP server not ready");

 let response=await request("/account");
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/login");
 await response.body?.cancel();

 response=await request("/login");
 assert.equal(response.status,200);
 const loginAction=actionId(await response.text(),'name="password"');
 response=await request("/login",{method:"POST",originHeader:origin,
  body:form(loginAction,{email,password:currentPassword})});
 assert.ok([303,307,308].includes(response.status),"Login should redirect");
 assert.equal(location(response).pathname,"/");
 const setCookie=response.headers.get("set-cookie")??"";
 cookie=setCookie.match(/job_session=([^;]+)/)?.[1];
 assert.ok(cookie,"Verified login must issue session");
 await response.body?.cancel();

 response=await request("/account",{cookieValue:cookie});
 assert.equal(response.status,200);
 const accountHTML=await response.text();
 assert.match(accountHTML,/人工审核/);
 const closureAction=actionId(accountHTML,'name="confirmDeletion"');
 const submit=(password=currentPassword,consent="REQUEST_MANUAL_REVIEW")=>{
  const fields={password,userId:otherId};
  if(consent!==null)fields.confirmDeletion=consent;
  return form(closureAction,fields);
 };

 response=await request("/account",{method:"POST",body:submit(),
  cookieValue:cookie,originHeader:"https://attacker.invalid"});
 await response.body?.cancel();
 assert.equal(await db.accountDeletionRequest.count({where:{userId:ownId}}),0,"Cross-origin must not create request");

 response=await request("/account",{method:"POST",body:submit(),cookieValue:cookie});
 await response.body?.cancel();
 assert.equal(await db.accountDeletionRequest.count({where:{userId:ownId}}),0,"Missing Origin must not create request");

 response=await request("/account",{method:"POST",body:submit("Wrong-Passphrase-For-Test-2026"),
  cookieValue:cookie,originHeader:origin});
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).searchParams.get("deletionError"),"1");
 await response.body?.cancel();
 assert.equal(await db.accountDeletionRequest.count({where:{userId:ownId}}),0,"Wrong password cannot request deletion");

 response=await request("/account",{method:"POST",body:submit(currentPassword,null),
  cookieValue:cookie,originHeader:origin});
 await response.body?.cancel();
 assert.equal(await db.accountDeletionRequest.count({where:{userId:ownId}}),0,"Missing consent cannot request deletion");

 response=await request("/account",{method:"POST",body:submit(),
  cookieValue:cookie,originHeader:origin});
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/account");
 assert.equal(location(response).searchParams.get("deletionRequested"),"1");
 await response.body?.cancel();
 const saved=await db.accountDeletionRequest.findUniqueOrThrow({where:{userId:ownId}});
 assert.equal(saved.status,"PENDING_MANUAL_REVIEW");

 response=await request("/account",{method:"POST",body:submit(),
  cookieValue:cookie,originHeader:origin});
 assert.ok([303,307,308].includes(response.status));
 await response.body?.cancel();
 const repeated=await db.accountDeletionRequest.findUniqueOrThrow({where:{userId:ownId}});
 assert.equal(repeated.id,saved.id,"Duplicate request must not create a second record");
 assert.equal(repeated.requestedAt.getTime(),saved.requestedAt.getTime(),"Original request timestamp remains");
 assert.equal(await db.accountDeletionRequest.count({where:{userId:otherId}}),0,"Forged userId must never affect another account");

 response=await request("/account",{cookieValue:cookie});
 assert.equal(response.status,200);
 const afterPage=await response.text();
 assert.match(afterPage,/等待人工审核/);
 assert.doesNotMatch(afterPage,/name="confirmDeletion"/,"Repeated public form should be hidden");

 const record=await db.toolOrder.findUniqueOrThrow({where:{id:orderId}});
 assert.equal(record.status,"PAID");
 assert.equal(record.amountFen,990);
 assert.equal(record.credits,20);
 assert.ok(await db.user.findUnique({where:{id:ownId}}),"Account must remain intact");
 assert.ok(await db.user.findUnique({where:{id:otherId}}),"Unrelated account must remain intact");
 assert.equal(await db.session.count({where:{userId:ownId}}),1,"Request must not silently log out or erase account");
 console.log(JSON.stringify({scope:"CI_ACCOUNT_DELETION_HTTP",pass:10,fail:0,
  checks:["anonymous blocked","verified login","authenticated review form",
   "cross-origin rejected","missing origin rejected","wrong password rejected",
   "consent required","valid review recorded","idempotent and tenant isolated",
   "financial/user/session records preserved"],
  noExternalCalls:true,noErasure:true}));
}
async function cleanup(){
 if(orderId)await db.toolOrder.deleteMany({where:{id:orderId}});
 if(ids.length){
  await db.toolRun.deleteMany({where:{userId:{in:ids}}});
  await db.toolGrant.deleteMany({where:{userId:{in:ids}}});
  await db.accountDeletionRequest.deleteMany({where:{userId:{in:ids}}});
  await db.user.deleteMany({where:{id:{in:ids}}});
 }
 await db.$disconnect();
}
try{const email=await seed();await run(email);}
catch(error){console.error("U01 ACCOUNT DELETION HTTP E2E FAILED",error);process.exitCode=1;}
finally{try{await cleanup();}catch(error){console.error("E2E cleanup failure",error);process.exitCode=1;}}
