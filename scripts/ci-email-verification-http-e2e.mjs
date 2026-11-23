#!/usr/bin/env node
/** Real Next.js Server Action E2E on CI-only disposable MySQL8; no external sends. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHash,scryptSync} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {PrismaClient} from "@prisma/client";

assert.equal(process.env.CI,"true","CI-only");
assert.equal(process.env.INTEGRATION_TEST_DATABASE,"true","Disposable database required");
assert.equal(process.env.ENABLE_REAL_PAYMENT,"false");
assert.equal(process.env.ENABLE_LIVE_AI,"false");
assert.equal(process.env.ENABLE_EMAIL_VERIFICATION_DELIVERY,"false");
assert.equal(process.env.ENABLE_PASSWORD_RESET_DELIVERY,"false");
assert.match(process.env.DATABASE_URL??"",/\/email_verification_ci$/,"Disallow any other database");

const port=process.env.EMAIL_VERIFICATION_HTTP_PORT??"3103";
assert.match(port,/^[1-9][0-9]{0,4}$/);
const origin="http://127.0.0.1:"+port;
const db=new PrismaClient();
const owned=[];
const candidate=randomBytes(32).toString("hex");
const expiredCandidate=randomBytes(32).toString("hex");
const digest=v=>createHash("sha256").update(v).digest("hex");
const password=["U01","Synthetic","Verification","2026"].join("-");
const salt=randomBytes(16).toString("hex");
const passwordHash=salt+":"+scryptSync(password,salt,64).toString("hex");
let mainId;
let expiredId;

const request=(path,{method="GET",body,originHeader}={})=>fetch(origin+path,{
 method,redirect:"manual",body,
 headers:{
  "x-real-ip":"203.0.113.46",
  ...(originHeader!==undefined?{origin:originHeader}:{})
 },
 signal:AbortSignal.timeout(12000)
});
const location=response=>new URL(response.headers.get("location")??"/",origin);
const actionId=(html,contains)=>{
 const fields=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
  .map(x=>x[1]).find(s=>s.includes(contains));
 assert.ok(fields,"Expected Server Action form not rendered");
 const name=fields.match(/name="(\$ACTION_ID_[a-zA-Z0-9]+)"/)?.[1];
 assert.ok(name,"Server Action identifier absent");
 return name;
};
function makeForm(id,fields){
 const form=new FormData();
 form.set(id,"");
 for(const [key,value]of Object.entries(fields))form.set(key,value);
 return form;
}
async function seed(){
 const primary=await db.user.create({data:{
  email:"ci-verify-"+randomUUID()+"@example.invalid",passwordHash
 }});
 mainId=primary.id;owned.push(primary.id);
 const secondary=await db.user.create({data:{
  email:"ci-verify-expired-"+randomUUID()+"@example.invalid",passwordHash
 }});
 expiredId=secondary.id;owned.push(secondary.id);
 await db.emailVerificationToken.createMany({data:[
  {userId:mainId,tokenHash:digest(candidate),expiresAt:new Date(Date.now()+600000)},
  {userId:expiredId,tokenHash:digest(expiredCandidate),expiresAt:new Date(Date.now()-600000)}
 ]});
}

async function run(){
 let ready=false;
 for(let i=0;i<35;i++){
  try{
   const response=await request("/verify-email");
   if(response.status===200){await response.body?.cancel();ready=true;break;}
   await response.body?.cancel();
  }catch{}
  await delay(1000);
 }
 assert.ok(ready,"Isolated email confirmation server not ready");

 let response=await request("/login");
 assert.equal(response.status,200);
 const loginFormId=actionId(await response.text(),'name="password"');
 const loginEmail=(await db.user.findUniqueOrThrow({where:{id:mainId}})).email;
 response=await request("/login",{method:"POST",originHeader:origin,
  body:makeForm(loginFormId,{email:loginEmail,password})});
 assert.ok([303,307,308].includes(response.status),"Unverified login must redirect");
 assert.equal(location(response).pathname,"/login");
 assert.equal(location(response).searchParams.get("pending"),"1");
 await response.body?.cancel();
 assert.equal(await db.session.count({where:{userId:mainId}}),0);

 response=await request("/verify-email?token="+candidate);
 assert.equal(response.status,200);
 const formHtml=await response.text();
 const confirmActionId=actionId(formHtml,'name="token"');
 const resendActionId=actionId(formHtml,'name="email"');
 assert.ok(formHtml.includes(candidate),"GET should render hidden token only");
 assert.equal(await db.emailVerificationToken.count({where:{userId:mainId}}),1);
 assert.equal((await db.user.findUniqueOrThrow({where:{id:mainId}})).emailVerifiedAt,null);

 response=await request("/verify-email",{method:"POST",originHeader:origin,
  body:makeForm(resendActionId,{email:loginEmail})});
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/verify-email");
 assert.equal(location(response).searchParams.get("resent"),"1");
 await response.body?.cancel();
 assert.equal((await db.emailVerificationToken.findUniqueOrThrow({where:{userId:mainId}})).tokenHash,digest(candidate),"Disabled mail cannot rotate token");

 response=await request("/verify-email",{method:"POST",originHeader:"https://attacker.invalid",
  body:makeForm(confirmActionId,{token:candidate})});
 await response.body?.cancel();
 assert.equal((await db.user.findUniqueOrThrow({where:{id:mainId}})).emailVerifiedAt,null,"Cross-origin must not verify");

 response=await request("/verify-email",{method:"POST",
  body:makeForm(confirmActionId,{token:candidate})});
 await response.body?.cancel();
 assert.equal((await db.user.findUniqueOrThrow({where:{id:mainId}})).emailVerifiedAt,null,"Missing Origin must not verify");

 response=await request("/verify-email",{method:"POST",originHeader:origin,
  body:makeForm(confirmActionId,{token:expiredCandidate})});
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/verify-email");
 assert.equal(location(response).searchParams.get("error"),"1");
 await response.body?.cancel();
 assert.equal((await db.user.findUniqueOrThrow({where:{id:expiredId}})).emailVerifiedAt,null,"Expired token must not verify");
 assert.equal(await db.emailVerificationToken.count({where:{userId:expiredId}}),1,"Expired token remains for authorized retention only");

 response=await request("/verify-email",{method:"POST",originHeader:origin,
  body:makeForm(confirmActionId,{token:candidate})});
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/login");
 assert.equal(location(response).searchParams.get("verified"),"1");
 await response.body?.cancel();
 const verified=await db.user.findUniqueOrThrow({where:{id:mainId}});
 assert.ok(verified.emailVerifiedAt,"Valid POST should verify user");
 assert.equal(await db.emailVerificationToken.count({where:{userId:mainId}}),0,"Single-use token must be consumed");
 assert.equal(await db.session.count({where:{userId:mainId}}),0,"Confirmation does not implicitly log in");

 response=await request("/verify-email",{method:"POST",originHeader:origin,
  body:makeForm(confirmActionId,{token:candidate})});
 assert.ok([303,307,308].includes(response.status));
 assert.equal(location(response).pathname,"/verify-email");
 assert.equal(location(response).searchParams.get("error"),"1");
 await response.body?.cancel();

 response=await request("/login",{method:"POST",originHeader:origin,
  body:makeForm(loginFormId,{email:loginEmail,password})});
 assert.ok([303,307,308].includes(response.status),"Verified login must redirect");
 assert.equal(location(response).pathname,"/");
 assert.match(response.headers.get("set-cookie")??"",/job_session=/);
 await response.body?.cancel();
 assert.equal(await db.session.count({where:{userId:mainId}}),1,"Verified login creates one valid session");

 console.log(JSON.stringify({scope:"CI_EMAIL_VERIFICATION_HTTP",pass:10,fail:0,
  checks:["unverified login blocked","verification GET read-only","mail disabled","cross-origin blocked",
   "missing-origin blocked","expired token denied","valid confirmation one-use","no implicit login",
   "replay denied","verified login creates session"],
  noMail:true,noPayment:true,noAi:true}));
}

async function cleanup(){
 if(owned.length)await db.user.deleteMany({where:{id:{in:owned}}});
 await db.$disconnect();
}
try{await seed();await run();}
catch(error){console.error("U01 EMAIL VERIFICATION HTTP E2E FAILED",error);process.exitCode=1;}
finally{try{await cleanup();}catch(error){console.error("E2E cleanup failed",error);process.exitCode=1;}}
