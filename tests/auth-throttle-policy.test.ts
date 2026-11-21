import {test} from "node:test";
import assert from "node:assert/strict";
import {checkAuthenticationThrottle} from "../lib/auth-throttle-policy";

const cfg={
 scope:"register" as const,
 identity:"someone@example.invalid",
 emailLimit:3,ipLimit:12,minutes:60
};
test("production without explicitly trusted proxy fails closed before touching limiter",async()=>{
 const calls:string[]=[];
 const allowed=await checkAuthenticationThrottle({
  ...cfg,nodeEnv:"production",configuredHeader:undefined,
  headers:new Headers({"x-real-ip":"198.51.100.42"})
 },async scope=>{calls.push(scope);return true;});
 assert.equal(allowed,false);
 assert.deepEqual(calls,[]);
});
test("development without configured proxy keeps email-only rate limiting",async()=>{
 const calls:string[]=[];
 const allowed=await checkAuthenticationThrottle({
  ...cfg,nodeEnv:"development",configuredHeader:undefined,
  headers:new Headers({"x-forwarded-for":"198.51.100.42"})
 },async (scope,identity,limit,minutes)=>{
  calls.push([scope,identity,limit,minutes].join(":"));return true;
 });
 assert.equal(allowed,true);
 assert.equal(calls.length,1);
 assert.match(calls[0],/^register:someone@example.invalid:3:60$/);
});
test("production requires one canonical trusted proxy IP and both independent rate limits",async()=>{
 const calls:string[]=[];
 const good=await checkAuthenticationThrottle({
  ...cfg,nodeEnv:"production",configuredHeader:"x-real-ip",
  headers:new Headers({"x-real-ip":"203.0.113.42","x-forwarded-for":"9.9.9.9"})
 },async (scope,identity)=>{
  calls.push(scope+":"+identity);return true;
 });
 assert.equal(good,true);
 assert.deepEqual(calls,["register:someone@example.invalid","register-trusted-ip:203.0.113.42"]);
 for(const headers of [
  new Headers({"x-forwarded-for":"203.0.113.42"}),
  new Headers({"x-real-ip":"203.0.113.42, 192.0.2.42"}),
  new Headers({"x-real-ip":"203.0.113.42:6000"})
 ]){
  let triggered=false;
  const result=await checkAuthenticationThrottle({
   ...cfg,nodeEnv:"production",configuredHeader:"x-real-ip",headers
  },async()=>{triggered=true;return true;});
  assert.equal(result,false);
  assert.equal(triggered,false);
 }
});
test("email or IP cap, and DB throttle errors, always deny authentication",async()=>{
 const options={
  ...cfg,nodeEnv:"production",configuredHeader:"cf-connecting-ip",
  headers:new Headers({"cf-connecting-ip":"2001:db8::7"})
 };
 let calls=0;
 assert.equal(await checkAuthenticationThrottle(options,async()=>{
  calls++;return false;
 }),false);
 assert.equal(calls,1);
 assert.equal(await checkAuthenticationThrottle(options,async scope=>
  scope!=="register-trusted-ip"
 ),false);
 assert.equal(await checkAuthenticationThrottle(options,async()=>{
  throw new Error("database unavailable");
 }),false);
});
