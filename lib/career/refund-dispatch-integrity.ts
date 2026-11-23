/** Read-only reconciliation guidance. Not proof of merchant refund status.
 * Never authorize sending a payment request or revoking a credit grant.
 */
export type DispatchLedgerSnapshot={
 state:"READY"|"IN_DOUBT"|"SUCCEEDED";
 intentState:"PREPARED"|"APPROVED";
 caseStatus:"OPEN"|"PREPARED"|"REJECTED"|"PROCESSING"|"SUCCEEDED"|"FAILED";
 orderStatus:"PENDING"|"PAID"|"CLOSED"|"REFUNDED";
 refundHold:boolean;
 credits:number;
 grantTotal:number|null;
 grantRemaining:number|null;
 hasReservedOrSuccessfulRun:boolean;
 approvedById:string|null;
 claimedAt:Date|null;
 claimantId:string|null;
 confirmedAt:Date|null;
};
export type RefundDispatchIntegrityIssue=
 "INVALID_CREDIT_LEDGER"|"MISSING_SECOND_APPROVAL"|"ORDER_OR_HOLD_MISMATCH"|
 "CASE_STATUS_MISMATCH"|"UNSETTLED_AI_USAGE"|"CLAIM_LIFECYCLE_MISMATCH"|
 "CONFIRMATION_LIFECYCLE_MISMATCH";
export type RefundDispatchIntegrityAssessment={
 status:"LEDGER_MISMATCH"|"PENDING_OPERATOR_REVIEW"|
 "CHANNEL_INQUIRY_REQUIRED"|"TERMINAL_CONSISTENT";
 issues:RefundDispatchIntegrityIssue[];
 canAutoSendRefund:false;
 canAutoRevokeCredits:false;
};

const validDate=(date:Date|null)=>date instanceof Date&&Number.isFinite(date.getTime());
export function assessRefundDispatchIntegrity(s:DispatchLedgerSnapshot):RefundDispatchIntegrityAssessment{
 const issues:RefundDispatchIntegrityIssue[]=[];
 const add=(code:RefundDispatchIntegrityIssue)=>{if(!issues.includes(code))issues.push(code);};
 const total=s.grantTotal,remaining=s.grantRemaining;
 if(!Number.isSafeInteger(s.credits)||s.credits<=0||
    total===null||remaining===null||
    !Number.isSafeInteger(total)||total!==s.credits||
    !Number.isSafeInteger(remaining)||remaining<0||remaining>total)
  add("INVALID_CREDIT_LEDGER");
 if(s.intentState!=="APPROVED"||!s.approvedById)add("MISSING_SECOND_APPROVAL");
 if(!s.refundHold||
  s.orderStatus!==(s.state==="SUCCEEDED"?"REFUNDED":"PAID"))
  add("ORDER_OR_HOLD_MISMATCH");
 if(s.caseStatus!==(s.state==="SUCCEEDED"?"SUCCEEDED":"PREPARED"))
  add("CASE_STATUS_MISMATCH");
 if(s.hasReservedOrSuccessfulRun)add("UNSETTLED_AI_USAGE");
 if(s.state==="READY"){
  if(s.claimedAt!==null||s.claimantId!==null)add("CLAIM_LIFECYCLE_MISMATCH");
  if(s.confirmedAt!==null)add("CONFIRMATION_LIFECYCLE_MISMATCH");
 }else{
  if(!validDate(s.claimedAt)||!s.claimantId)add("CLAIM_LIFECYCLE_MISMATCH");
  if(s.state==="IN_DOUBT"){
   if(s.confirmedAt!==null)add("CONFIRMATION_LIFECYCLE_MISMATCH");
  }else if(!validDate(s.confirmedAt)){
   add("CONFIRMATION_LIFECYCLE_MISMATCH");
  }
 }
 if(s.state==="SUCCEEDED"){
  if(s.grantRemaining!==0)add("INVALID_CREDIT_LEDGER");
 }else if(s.grantRemaining!==s.grantTotal){
  add("INVALID_CREDIT_LEDGER");
 }
 return {status:issues.length?"LEDGER_MISMATCH":
  s.state==="READY"?"PENDING_OPERATOR_REVIEW":
  s.state==="IN_DOUBT"?"CHANNEL_INQUIRY_REQUIRED":"TERMINAL_CONSISTENT",
  issues,canAutoSendRefund:false,canAutoRevokeCredits:false};
}
