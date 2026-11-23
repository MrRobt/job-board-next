#!/usr/bin/env node
/** Genuine Next.js Server Actions, synthetic people and disposable MySQL only. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID,scryptSync} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {PrismaClient} from "@prisma/client";

assert.equal(process.env.CI,"true","CI only");
assert.equal(process.env.INTEGRATION_TEST_DATABASE,"true","Disposable DB required");
assert.match(process.env.DATABASE_URL??"",/\/account_review_audit_ci$/);
assert.equal(process.env.ENABLE_ACCOUNT_DELETION_REVIEW_WRITE,"true");
for(const key of ["ENABLE_REAL_PAYMENT","ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI",
 "ENABLE_TOOL_PAYMENTS","ENABLE_EMAIL_VERIFICATION_DELIVERY","ENABLE_PASSWORD_RESET_DELIVERY",
 "ENABLE_REFUND_SEND","ENABLE_PAYMENT_RECONCILIATION"]){
 assert.equal(process.env[key],"false",key);
}
const port=process.env.ACCOUNT_REVIEW_HTTP_PORT??"3105";
assert.match(port,/^[1-9][0-9]{0,4}$/);
const origin="http://127.0.0.1:"+port;
const db=new PrismaClient();
const userIds=[];
let requestId=null,orderId=null,adminEmail=null,userEmail=null;
const password=["U01","Review","Synthetic","2026"].join("-");
const salt=randomBytes(16).toString("hex");
const passwordHash=salt+":"+scryptSync(password,salt,64).toString("hex");

const request=(path,{method="GET",body,originHeader,cookieValue}={})=>fetch(origin+path,{
 method,redirect:"manual",body,
 headers:{"x-real-ip":"203.0.113.57",
  ...(originHeader!==undefined?{origin:originHeader}:{}),
  ...(cookieValue?{cookie:"job_session="+cookieValue}:{})
 },
 signal:AbortSignal.timeout(15000)
});
const location=response=>new URL(response.headers.get("location")??"/",origin);
const actionId=(html,field)=>{
 const inside=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
  .map(x=>x[1]).find(s=>s.includes(field));
 assert.ok(inside,"Server Action form not found for "+field);
 const id=inside.match(/name="(\$ACTION_ID_[a-zA-Z0-9]+)"/)?.[1];
 assert.ok(id,"Action ID missing for "+field);
 return id;
};
const form=(id,fields)=>{
 const payload=new FormData();
 payload.set(id,"");
 for(const [key,value] of Object.entries(fields))if(value!==null)payload.set(key,value);
 return payload;
};
async function seed(){
 const admin=await db.user.create({data:{
  email:"u01-review-admin-"+randomUUID()+"@example.invalid",role:"ADMIN",
  passwordHash,emailVerifiedAt:new Date()
 }});
 const subject=await db.user.create({data:{
  email:"u01-review-subject-"+randomUUID()+"@example.invalid",passwordHash,emailVerifiedAt:new Date()
 }});
 const other=await db.user.create({data:{
  email:"u01-review-regular-"+randomUUID()+"@example.invalid",passwordHash,emailVerifiedAt:new Date()
 }});
 userIds.push(admin.id,subject.id,other.id);
 adminEmail=admin.email;userEmail=other.email;
 const review=await db.accountDeletionRequest.create({data:{userId:subject.id}});
 requestId=review.id;
 orderId=randomUUID().replace(/-/g,"").slice(0,32);
 await db.toolOrder.create({data:{
  id:orderId,userId:subject.id,sku:"STARTER20",
  amountFen:990,credits:20,provider:"MOCK",status:"PAID"
 }});
}
async function login(email,loginAction){
 const response=await request("/login",{method:"POST",originHeader:origin,
  body:form(loginAction,{email,password})});
 assert.ok([303,307,308].includes(response.status),"Login must redirect");
 const cookie=(response.headers.get("set-cookie")??"").match(/job_session=([^;]+)/)?.[1];
 assert.ok(cookie,"Verified login session missing");
 await response.body?.cancel();
 return cookie;
}

async function run(){
 let ready=false;
 for(let i=0;i<40;i++){
  try{
   const r=await request("/login");
   if(r.status===200){await r.body?.cancel();ready=true;break;}
   await r.body?.cancel();
  }catch{}
  await sleep(1000);
 }
 assert.ok(ready,"Isolated account review HTTP server not ready");
 let response=await request("/admin/account-deletions");
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/login");
 await response.body?.cancel();

 response=await request("/login");
 const loginId=actionId(await response.text(),'name="password"');
 const userCookie=await login(userEmail,loginId);
 response=await request("/admin/account-deletions",{cookieValue:userCookie});
 assert.ok([303,307,308].includes(response.status),"USER must not review");
 assert.equal(location(response).pathname,"/");
 await response.body?.cancel();

 const adminCookie=await login(adminEmail,loginId);
 response=await request("/admin/account-deletions",{cookieValue:adminCookie});
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/账户注销人工审核队列/);
 assert.match(html,/name="reasonCode"/,"Approved CI should render audit-only form");
 assert.ok(!html.includes(adminEmail),"Must not disclose administrator email");
 const reviewAction=actionId(html,'name="reasonCode"');
 const reviewForm=(reasonCode="NEEDS_PRIVACY_REVIEW",confirmed="yes")=>
  form(reviewAction,{requestId,reasonCode,confirmed});
 const recorded=()=>db.accountDeletionReviewEvent.count({where:{requestId}});

 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm(),originHeader:origin,cookieValue:userCookie
 });
 await response.body?.cancel();
 assert.equal(await recorded(),0,"USER POST must fail");
 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm(),originHeader:"https://attacker.invalid",
  cookieValue:adminCookie
 });
 await response.body?.cancel();
 assert.equal(await recorded(),0,"Cross-origin POST must fail");
 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm(),cookieValue:adminCookie
 });
 await response.body?.cancel();
 assert.equal(await recorded(),0,"Missing-origin POST must fail");

 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm("NEEDS_PRIVACY_REVIEW",null),
  originHeader:origin,cookieValue:adminCookie
 });
 await response.body?.cancel();
 assert.equal(await recorded(),0,"Explicit confirmation is required");

 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm("APPROVED_DELETE","yes"),
  originHeader:origin,cookieValue:adminCookie
 });
 await response.body?.cancel();
 assert.equal(await recorded(),0,"Unapproved reason must be rejected");

 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm(),originHeader:origin,cookieValue:adminCookie
 });
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/admin/account-deletions");
 assert.equal(location(response).searchParams.get("reviewOutcome"),"RECORDED");
 await response.body?.cancel();
 assert.equal(await recorded(),1);

 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm(),originHeader:origin,cookieValue:adminCookie
 });
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).searchParams.get("reviewOutcome"),"ALREADY_RECORDED");
 await response.body?.cancel();
 assert.equal(await recorded(),1,"Repeated review must be idempotent");

 response=await request("/admin/account-deletions",{
  method:"POST",body:reviewForm("NEEDS_OFFLINE_VERIFICATION"),
  originHeader:origin,cookieValue:adminCookie
 });
 assert.ok([303,307,308].includes(response.status));
 await response.body?.cancel();
 assert.equal(await recorded(),2,"Another fixed review reason may be recorded");
 const requestState=await db.accountDeletionRequest.findUniqueOrThrow({where:{id:requestId}});
 assert.equal(requestState.status,"PENDING_MANUAL_REVIEW","Audit is not deletion approval");
 const recordedEvent=await db.accountDeletionReviewEvent.findFirstOrThrow({where:{requestId}});
 assert.equal(recordedEvent.operatorId,userIds[0]);
 const syntheticOrder=await db.toolOrder.findUniqueOrThrow({where:{id:orderId}});
 assert.equal(syntheticOrder.status,"PAID");
 assert.equal(syntheticOrder.amountFen,990);
 assert.ok(await db.user.findUnique({where:{id:userIds[1]}}));

 response=await request("/admin/account-deletions",{cookieValue:adminCookie});
 assert.equal(response.status,200);
 const viewed=await response.text();
 assert.match(viewed,/NEEDS_PRIVACY_REVIEW/);
 assert.match(viewed,/NEEDS_OFFLINE_VERIFICATION/);
 assert.ok(!viewed.includes("u01-review-subject-"),"Raw email must be masked");
 console.log(JSON.stringify({scope:"CI_ACCOUNT_DELETION_REVIEW_HTTP",pass:12,fail:0,
  checks:["anonymous denied","USER read denied","ADMIN form","USER POST denied",
   "cross-origin denied","missing-origin denied","consent required",
   "unknown reason refused","valid audit recorded","replay idempotent",
   "second fixed reason recorded","users, request, payment and masked queue preserved"],
  noExternalCalls:true,noAutoDeletion:true}));
}
async function cleanup(){
 if(userIds.length){
  await db.accountDeletionReviewEvent.deleteMany({where:{operatorId:{in:userIds}}});
  if(orderId)await db.toolOrder.deleteMany({where:{id:orderId}});
  if(requestId)await db.accountDeletionRequest.deleteMany({where:{id:requestId}});
  await db.user.deleteMany({where:{id:{in:userIds}}});
 }
 await db.$disconnect();
}
try{await seed();await run();}
catch(error){console.error("U01 ACCOUNT REVIEW HTTP FAILED",error);process.exitCode=1;}
finally{try{await cleanup();}catch(error){console.error("U01 cleanup failed",error);process.exitCode=1;}}
