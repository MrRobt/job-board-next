import {test} from "node:test";
import assert from "node:assert/strict";
import {isTrustedActionOrigin} from "../lib/action-origin-policy";

test("U01 reset form accepts a canonical same-origin request",()=>{
 assert.equal(isTrustedActionOrigin("https://accounts.example.com","accounts.example.com"),true);
 assert.equal(isTrustedActionOrigin("http://127.0.0.1:3102","127.0.0.1:3102"),true);
});
test("U01 password reset forbids missing, mismatched and malformed Origin/Host",()=>{
 for(const [origin,host] of [
  [null,"accounts.example.com"],["https://accounts.example.com",null],
  ["https://attacker.example","accounts.example.com"],
  ["https://accounts.example.com.evil.invalid","accounts.example.com"],
  ["https://accounts.example.com?x=1","accounts.example.com"],
  ["https://name:pass@accounts.example.com","accounts.example.com"],
  ["file:///tmp/test","accounts.example.com"],
  ["http://127.0.0.1:3102","127.0.0.1:3103"],
  ["https://accounts.example.com","accounts.example.com, attacker.example"]
 ] as const){
  assert.equal(isTrustedActionOrigin(origin,host),false,String(origin));
 }
});
