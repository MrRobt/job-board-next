import {test} from "node:test";
import assert from "node:assert/strict";
import {makeVerificationToken,hashVerificationToken,validVerificationToken,verificationExpiresAt} from "../lib/email-verification-policy";

test("verification token length and hashing",()=>{
 const first=makeVerificationToken();
 const second=makeVerificationToken();
 assert.equal(first.length,64);
 assert.notEqual(first,second);
 assert.equal(hashVerificationToken(first).length,64);
 assert.notEqual(hashVerificationToken(first),first);
 assert.equal(hashVerificationToken(first),hashVerificationToken(first));
});
test("token parser rejects malformed and long inputs",()=>{
 const candidate=makeVerificationToken();
 for(const value of ["",candidate.toUpperCase(),candidate+"0",candidate.slice(1),"not-hex","a".repeat(10000)]){
  assert.equal(validVerificationToken(value),false);
 }
 assert.equal(validVerificationToken(candidate),true);
});
test("expiry is bounded and fails closed on invalid clock",()=>{
 const now=new Date("2026-11-23T00:00:00.000Z");
 assert.equal(verificationExpiresAt(now).getTime()-now.getTime(),24*60*60*1000);
 assert.throws(()=>verificationExpiresAt(new Date(NaN)),/time/i);
});
