import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
import {evaluatePrelaunchConfig,offFlags} from "../scripts/prelaunch-env-guard.mjs";

const safe={DJS_PRELAUNCH_MODE:"LOCAL_PREVIEW",NODE_ENV:"test",APP_ORIGIN:"http://localhost:3000"};
test("prelaunch defaults closed and requires explicit mode",()=>{
 const r=evaluatePrelaunchConfig({});
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.violations.includes("DJS_PRELAUNCH_MODE"));
 assert.equal(evaluatePrelaunchConfig(safe).status,"PASS");
});
test("every live payment, mock, reconciliation, refund, model or approval switch blocks prelaunch",()=>{
 for(const flag of offFlags){
  const r=evaluatePrelaunchConfig({...safe,[flag]:"true"});
  assert.equal(r.status,"BLOCKED",flag);
  assert.ok(r.violations.includes(flag));
  assert.equal(evaluatePrelaunchConfig({...safe,[flag]:"TRUE"}).status,"BLOCKED",flag);
  assert.equal(evaluatePrelaunchConfig({...safe,[flag]:"false"}).status,"PASS",flag);
 }
});
test("public prelaunch requires secure canonical origin, a known proxy header and production mode",()=>{
 const publicSafe={
  DJS_PRELAUNCH_MODE:"PUBLIC_PRELAUNCH",NODE_ENV:"production",
  APP_ORIGIN:"https://jobs.company.com",TRUSTED_CLIENT_IP_HEADER:"x-real-ip"
 };
 assert.equal(evaluatePrelaunchConfig(publicSafe).status,"PASS");
 for(const origin of [
  "http://jobs.company.com","https://localhost","https://127.0.0.1",
  "https://jobs.example","https://jobs.company.com/path",
  "https://jobs.company.com:8443","https://name:pass@jobs.company.com",
  "https://jobs.company.com?x=1","https://jobs.company.com.evil.invalid",
  " https://jobs.company.com","https://jobs.company.com#fragment"
 ]){
  assert.ok(evaluatePrelaunchConfig({...publicSafe,APP_ORIGIN:origin}).violations.includes("APP_ORIGIN"),origin);
 }
 assert.ok(evaluatePrelaunchConfig({...publicSafe,TRUSTED_CLIENT_IP_HEADER:"x-forwarded-for"}).violations.includes("TRUSTED_CLIENT_IP_HEADER"));
 assert.ok(evaluatePrelaunchConfig({...publicSafe,NODE_ENV:"development"}).violations.includes("NODE_ENV"));
});
test("CLI reports only violation names and exit code, not configuration values",()=>{
 const script=join(process.cwd(),"scripts","prelaunch-env-guard.mjs");
 const unknownValue="sensitive-do-not-print-me";
 const env:NodeJS.ProcessEnv={...process.env,DJS_PRELAUNCH_MODE:"LOCAL_PREVIEW",NODE_ENV:"test",
  APP_ORIGIN:"http://localhost:3000",ENABLE_REAL_PAYMENT:unknownValue};
 for(const key of offFlags)env[key]=key==="ENABLE_REAL_PAYMENT"?unknownValue:"false";
 const r=spawnSync(process.execPath,[script],{env,encoding:"utf8",timeout:10000});
 assert.equal(r.status,2,r.stderr);
 assert.ok(r.stdout.includes("ENABLE_REAL_PAYMENT"));
 assert.ok(!r.stdout.includes(unknownValue));
 assert.ok(!r.stdout.includes("jobs.company.com"));
});
