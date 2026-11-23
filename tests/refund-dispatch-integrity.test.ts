import {test} from "node:test";
import assert from "node:assert/strict";
import {assessRefundDispatchIntegrity,type DispatchLedgerSnapshot} from "../lib/career/refund-dispatch-integrity";

const valid:DispatchLedgerSnapshot={
 state:"READY",intentState:"APPROVED",caseStatus:"PREPARED",
 orderStatus:"PAID",refundHold:true,credits:20,grantTotal:20,grantRemaining:20,
 hasReservedOrSuccessfulRun:false,approvedById:"reviewer",claimedAt:null,
 claimantId:null,confirmedAt:null
};
test("B06 refund dispatch states remain informational, never automatic refund authority",()=>{
 const ready=assessRefundDispatchIntegrity(valid);
 assert.equal(ready.status,"PENDING_OPERATOR_REVIEW");
 assert.deepEqual(ready.issues,[]);
 assert.equal(ready.canAutoSendRefund,false);
 assert.equal(ready.canAutoRevokeCredits,false);
 const waiting=assessRefundDispatchIntegrity({...valid,state:"IN_DOUBT",
  claimedAt:new Date(),claimantId:"dispatcher"});
 assert.equal(waiting.status,"CHANNEL_INQUIRY_REQUIRED");
 assert.deepEqual(waiting.issues,[]);
 assert.equal(waiting.canAutoSendRefund,false);
 const settled=assessRefundDispatchIntegrity({...valid,state:"SUCCEEDED",
  claimedAt:new Date(),claimantId:"dispatcher",confirmedAt:new Date(),
  orderStatus:"REFUNDED",caseStatus:"SUCCEEDED",grantRemaining:0});
 assert.equal(settled.status,"TERMINAL_CONSISTENT");
 assert.deepEqual(settled.issues,[]);
});
test("B06 real paid credit, case and claimed dispatch contradictions fail closed",()=>{
 const changes:DispatchLedgerSnapshot[]=[
  {...valid,intentState:"PREPARED"},
  {...valid,approvedById:null},
  {...valid,orderStatus:"PENDING"},
  {...valid,refundHold:false},
  {...valid,caseStatus:"OPEN"},
  {...valid,grantTotal:null,grantRemaining:null},
  {...valid,grantTotal:21},
  {...valid,grantRemaining:19},
  {...valid,hasReservedOrSuccessfulRun:true},
  {...valid,claimedAt:new Date()},
  {...valid,state:"IN_DOUBT",claimedAt:null,claimantId:null},
  {...valid,state:"IN_DOUBT",claimedAt:new Date(),claimantId:null},
  {...valid,state:"SUCCEEDED",claimedAt:new Date(),claimantId:"dispatcher",confirmedAt:new Date(),
   orderStatus:"PAID",caseStatus:"SUCCEEDED",grantRemaining:0},
  {...valid,state:"SUCCEEDED",claimedAt:new Date(),claimantId:"dispatcher",confirmedAt:new Date(),
   orderStatus:"REFUNDED",caseStatus:"PREPARED",grantRemaining:0},
  {...valid,state:"SUCCEEDED",claimedAt:new Date(),claimantId:"dispatcher",confirmedAt:null,
   orderStatus:"REFUNDED",caseStatus:"SUCCEEDED",grantRemaining:0},
  {...valid,grantRemaining:-1},
  {...valid,credits:Number.NaN},
  {...valid,credits:2.5}
 ];
 for(const snapshot of changes){
  const assessed=assessRefundDispatchIntegrity(snapshot);
  assert.equal(assessed.status,"LEDGER_MISMATCH",JSON.stringify(snapshot));
  assert.ok(assessed.issues.length>0);
  assert.equal(assessed.canAutoSendRefund,false);
  assert.equal(assessed.canAutoRevokeCredits,false);
 }
});
test("B06 query is purely diagnostic, no user or fund mutation calls",()=>{
 const result=assessRefundDispatchIntegrity(valid);
 assert.equal(Object.hasOwn(result,"queryMerchant"),false);
 assert.equal(Object.hasOwn(result,"refundStatusUpdate"),false);
});
