export type DeletionReviewReasonCode=
 "NEEDS_PRIVACY_REVIEW"|"FINANCIAL_HOLD_RECORDED"|"NEEDS_OFFLINE_VERIFICATION";

export function reviewGates(env:Readonly<Record<string,string|undefined>>){
 return {canRecord:env.ENABLE_ACCOUNT_DELETION_REVIEW_WRITE==="true"};
}

/** Fixed-reason, no PII, no operator ID from untrusted form. */
export function parseDeletionReviewForm(form:FormData):{
 requestId:string;reasonCode:DeletionReviewReasonCode;
}{
 const fields=["requestId","reasonCode","confirmed"];
 for(const [name] of form.entries())if(!fields.includes(name)&&
  !/^\$ACTION_[a-zA-Z0-9_]+$/.test(name))throw Error("Unknown review field");
 for(const name of fields)if(form.getAll(name).length!==1)throw Error("Missing or duplicate review field");
 const requestId=form.get("requestId"),reasonCode=form.get("reasonCode");
 if(form.get("confirmed")!=="yes")throw Error("Explicit confirmation required");
 if(typeof requestId!=="string"||!/^c[a-z0-9]{20,35}$/.test(requestId))throw Error("Invalid request ID");
 if(reasonCode!=="NEEDS_PRIVACY_REVIEW"&&reasonCode!=="FINANCIAL_HOLD_RECORDED"&&
  reasonCode!=="NEEDS_OFFLINE_VERIFICATION")throw Error("Invalid review reason");
 return {requestId,reasonCode};
}
