import {test} from "node:test";
import assert from "node:assert/strict";
import {passwordResetExpiresAt,validPasswordResetInput} from "../lib/password-reset-policy";

test("password recovery is short lived and refuses invalid time",()=>{
 const now=new Date("2026-11-23T00:00:00.000Z");
 assert.equal(passwordResetExpiresAt(now).getTime()-now.getTime(),30*60*1000);
 assert.throws(()=>passwordResetExpiresAt(new Date(Number.NaN)),/time/i);
});
test("password reset input follows existing 12-128 character policy",()=>{
 assert.equal(validPasswordResetInput("x".repeat(11)),false);
 assert.equal(validPasswordResetInput("x".repeat(12)),true);
 assert.equal(validPasswordResetInput("x".repeat(128)),true);
 assert.equal(validPasswordResetInput("x".repeat(129)),false);
 assert.equal(validPasswordResetInput(null),false);
});
