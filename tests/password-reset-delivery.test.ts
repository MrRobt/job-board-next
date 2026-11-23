import {test} from "node:test";
import assert from "node:assert/strict";
import {sendPasswordResetEmail,passwordResetDeliveryConfigured} from "../lib/password-reset-delivery";
import {makeVerificationToken} from "../lib/email-verification-policy";

const config={
 ENABLE_PASSWORD_RESET_DELIVERY:"true",
 RESEND_API_KEY:"placeholder",
 EMAIL_FROM_ADDRESS:"no-reply@example.invalid",
 APP_PUBLIC_BASE_URL:"https://example.invalid"
};
test("U01 password reset mail is disabled without explicit approval and full config",async()=>{
 for(const env of [
  {},{...config,ENABLE_PASSWORD_RESET_DELIVERY:"false"},
  {...config,RESEND_API_KEY:""},
  {...config,APP_PUBLIC_BASE_URL:"http://example.invalid"},
  {...config,EMAIL_FROM_ADDRESS:"invalid"}
 ]){
  assert.equal(passwordResetDeliveryConfigured(env),false);
  let requests=0;
  const delivered=await sendPasswordResetEmail("user@example.invalid",makeVerificationToken(),env,async()=>{
   requests++;throw Error("unexpected request");
  });
  assert.equal(delivered,false);
  assert.equal(requests,0);
 }
});
test("only approved reset mail reaches fixed provider without redirects",async()=>{
 const candidate=makeVerificationToken();
 let calls=0;
 const ok=await sendPasswordResetEmail("user@example.invalid",candidate,config,async(url,init)=>{
  calls++;
  assert.equal(url,"https://api.resend.com/emails");
  assert.equal(init?.method,"POST");
  assert.equal(init?.redirect,"error");
  const body=JSON.parse(String(init?.body));
  assert.equal(body.to[0],"user@example.invalid");
  assert.ok(body.text.includes("/reset-password?token="));
  assert.ok(body.text.includes(candidate));
  return {ok:true} as Response;
 });
 assert.equal(ok,true);
 assert.equal(calls,1);
});
test("reset mail provider failure does not count as success",async()=>{
 assert.equal(await sendPasswordResetEmail("user@example.invalid",makeVerificationToken(),config,async()=>{
  throw Error("network issue");
 }),false);
});
