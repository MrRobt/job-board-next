#!/usr/bin/env node
/**
 * Anonymous release smoke test. Only talks to localhost:3000 and does not
 * authenticate, run payment actions, consume AI credits or access private data.
 */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";

// An explicit alternative port lets a new build be checked without replacing
// another agent's existing localhost:3000 process. Always localhost only.
const port=process.env.SMOKE_PORT??"3000";
assert.match(port,/^[1-9][0-9]{0,4}$/,"Invalid smoke port");
assert.ok(Number(port)<=65535,"Invalid smoke port");
const origin=`http://127.0.0.1:${port}`;
const pages=[
 {path:"/",required:["职讯集","求职工作台"]},
 {path:"/pricing",required:["轻量次数包"]},
 {path:"/login",required:["登录职讯集"]},
 {path:"/register",required:["注册账号"]},
];
const restricted=[
 "/admin","/admin/tool-orders","/admin/refund-dispatch","/admin/incidents",
 "/account","/tracker","/tools/resume","/tools/interview"
];
const privateHeaders=[
 "cache-control"
];

async function request(path){
 const response=await fetch(origin+path,{
  method:"GET",redirect:"manual",cache:"no-store",
  signal:AbortSignal.timeout(5000),
  headers:{"Accept":"text/html,application/json"}
 });
 return response;
}
function checkSecurityHeaders(response,path){
 assert.equal(response.headers.get("x-content-type-options"),"nosniff",path+" nosniff");
 assert.equal(response.headers.get("x-frame-options"),"DENY",path+" clickjacking");
 assert.equal(response.headers.get("referrer-policy"),"no-referrer",path+" referer leakage");
 assert.equal(response.headers.get("permissions-policy"),"camera=(), microphone=(), geolocation=()",path+" permissions policy");
 assert.ok(!response.headers.has("x-powered-by"),path+" must not expose framework");
}
function checkPrivateCache(response,path){
 const cache=response.headers.get(privateHeaders[0])??"";
 assert.match(cache,/private/i,path+" private cache");
 assert.match(cache,/no-store/i,path+" cache disabled");
}
async function main(){
 let ready=false;
 for(let i=0;i<35;i++){
  try{
   const response=await request("/");
   await response.body?.cancel();
   if(response.status===200){ready=true;break;}
  }catch{}
  await sleep(1000);
 }
 assert.ok(ready,"Local app did not start on port 3000");

 const outcomes=[];
 for(const page of pages){
  const response=await request(page.path);
  assert.equal(response.status,200,page.path+" public status");
  checkSecurityHeaders(response,page.path);
  const html=await response.text();
  for(const word of page.required){
   assert.ok(html.includes(word),page.path+" missing expected page content");
  }
  if(page.path==="/login"||page.path==="/register")
   checkPrivateCache(response,page.path);
  outcomes.push({path:page.path,status:200});
 }
 for(const path of restricted){
  const response=await request(path);
  assert.ok([307,308].includes(response.status),path+" must redirect unauthenticated users");
  const location=response.headers.get("location");
  assert.ok(location,"Missing redirect for "+path);
  const redirect=new URL(location,origin);
  assert.equal(redirect.origin,origin,path+" external redirect is forbidden");
  assert.equal(redirect.pathname,"/login",path+" unauthenticated redirect target");
  checkSecurityHeaders(response,path);
  checkPrivateCache(response,path);
  await response.body?.cancel();
  outcomes.push({path,status:response.status,redirect:"/login"});
 }
 for(const path of ["/api/readyz","/checkout/disabled"]){
  const response=await request(path);
  assert.equal(response.status,404,path+" must be unavailable without an operator token");
  checkSecurityHeaders(response,path);
  if(path==="/api/readyz")checkPrivateCache(response,path);
  await response.body?.cancel();
  outcomes.push({path,status:404});
 }
 console.log(JSON.stringify({
  scope:"ANONYMOUS_LOCAL_ONLY",
  pass:outcomes.length,fail:0,
  noCredentials:true,noPaymentRequests:true,noAiRequests:true,
  checks:outcomes
 },null,2));
}
main().catch(e=>{
 console.error("Local release smoke test FAILED:",e?.message??String(e));
 process.exitCode=1;
});
