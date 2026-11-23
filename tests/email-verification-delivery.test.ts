import {test} from "node:test";
import assert from "node:assert/strict";
import {sendVerificationEmail,mailDeliveryConfigured} from "../lib/email-verification-delivery";
import {makeVerificationToken} from "../lib/email-verification-policy";

const approved={
 ENABLE_EMAIL_VERIFICATION_DELIVERY:"true",
 RESEND_API_KEY:"placeholder",
 EMAIL_FROM_ADDRESS:"no-reply@example.invalid",
 APP_PUBLIC_BASE_URL:"https://example.invalid"
};
test("email delivery fails closed on missing approval, origin, sender or provider key",async()=>{
 for(const env of [
  {},{...approved,ENABLE_EMAIL_VERIFICATION_DELIVERY:"false"},
  {...approved,RESEND_API_KEY:""},
  {...approved,APP_PUBLIC_BASE_URL:"http://example.invalid"},
  {...approved,APP_PUBLIC_BASE_URL:"https://example.invalid/evil"},
  {...approved,EMAIL_FROM_ADDRESS:"\r\nother@example.invalid"}
 ]){
  assert.equal(mailDeliveryConfigured(env),false);
  let invoked=false;
  const result=await sendVerificationEmail("someone@example.invalid",makeVerificationToken(),env,async()=>{
   invoked=true;throw new Error("unexpected outgoing request");
  });
  assert.equal(result,false);
  assert.equal(invoked,false);
 }
});
test("approved email is sent only to fixed provider, with one-use link and no redirect",async()=>{
 const candidate=makeVerificationToken();
 let requests=0;
 const result=await sendVerificationEmail("someone@example.invalid",candidate,approved,async(url,init)=>{
  requests++;
  assert.equal(url,"https://api.resend.com/emails");
  assert.equal(init?.method,"POST");
  assert.equal(init?.redirect,"error");
  const payload=JSON.parse(String(init?.body));
  assert.equal(payload.to[0],"someone@example.invalid");
  assert.ok(payload.text.includes(candidate));
  assert.ok(payload.text.includes("https://example.invalid/verify-email?token="));
  return {ok:true} as Response;
 });
 assert.equal(result,true);
 assert.equal(requests,1);
 assert.equal(await sendVerificationEmail("bad\r\naddress",candidate,approved,async()=>{throw Error("unexpected");}),false);
});
test("provider network failures never count as delivered",async()=>{
 const result=await sendVerificationEmail("someone@example.invalid",makeVerificationToken(),approved,async()=>{throw Error("not available");});
 assert.equal(result,false);
});
