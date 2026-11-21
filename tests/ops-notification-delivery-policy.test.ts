import {test} from "node:test";
import assert from "node:assert/strict";
import {authorizeOpsNotificationDelivery as authorize} from "../lib/career/ops-notification-delivery-policy";

const base={enabled:"true",operatorApproved:"true",destination:"https://alerts.example.com",approvedOrigins:["https://alerts.example.com"]};

test("notification transport is denied without both explicit approvals",()=>{
  assert.deepEqual(authorize({...base,enabled:undefined}),{allowed:false,reason:"DISABLED"});
  assert.deepEqual(authorize({...base,enabled:"TRUE"}),{allowed:false,reason:"DISABLED"});
  assert.deepEqual(authorize({...base,operatorApproved:undefined}),{allowed:false,reason:"UNAPPROVED"});
  assert.deepEqual(authorize({...base,operatorApproved:"yes"}),{allowed:false,reason:"UNAPPROVED"});
});
test("notification transport requires exact canonical approved https origin",()=>{
  assert.deepEqual(authorize(base),{allowed:true,destination:"https://alerts.example.com"});
  assert.deepEqual(authorize({...base,destination:"https://evilalerts.example.com"}),{allowed:false,reason:"NOT_ALLOWLISTED"});
  assert.deepEqual(authorize({...base,destination:"https://alerts.example.com.evil.org"}),{allowed:false,reason:"NOT_ALLOWLISTED"});
  assert.deepEqual(authorize({...base,approvedOrigins:["https://alerts.example.com.evil.org"]}),{allowed:false,reason:"NOT_ALLOWLISTED"});
});
test("notification transport denies unsafe endpoint syntax and local addresses",()=>{
  for(const destination of [
    "http://alerts.example.com","https://user:pass@alerts.example.com",
    "https://alerts.example.com:444","https://alerts.example.com/push",
    "https://alerts.example.com?foo=bar","https://alerts.example.com/#x",
    "https://localhost","https://node.internal","https://127.0.0.1",
    "https://[::1]"," https://alerts.example.com", "https://alerts.example.com."
  ]){
    assert.deepEqual(authorize({...base,destination,approvedOrigins:[destination]}),
      {allowed:false,reason:"INVALID_DESTINATION"},destination);
  }
});
