import type {ModelUsageEvidence} from "./model-usage";
import type {ModelCostPolicy} from "./model-cost-policy";

/**
 * Pure cross-check for already recorded, sanitized model-usage observations.
 * This NEVER certifies a provider invoice: the caller must independently
 * authenticate the invoice source and verify the data set is complete.
 * Nothing in this module stores raw prompts, responses or access tokens.
 */
export type ModelUsageRunObservation={
 runId:string;
 usage:ModelUsageEvidence;
};
export type QuotedCostCheck={
 status:"INPUT_MATCH"|"REVIEW_REQUIRED";
 reasonCodes:string[];
 provider:string;
 model:string;
 runCount:number;
 pricedRunCount:number;
 unknownRunCount:number;
 overBudgetRunCount:number;
 knownQuotedFen:number;
 claimedInvoiceFen:number|null;
 differenceFen:number|null;
};
const int=(value:unknown,max:number)=>typeof value==="number"&&
 Number.isSafeInteger(value)&&value>=0&&value<=max;
const idOk=(value:string,max:number)=>typeof value==="string"&&
 value.length>0&&value.length<=max&&/^[a-zA-Z0-9._-]+$/.test(value);

/**
 * Compare the sum of per-request *quoted* integer-fen costs with an optional
 * externally supplied claim. Return REVIEW_REQUIRED whenever the evidence
 * is incomplete, contradictory, duplicate, out of budget, or mismatched.
 */
export function checkQuotedModelCosts(
 provider:string,model:string,observations:readonly ModelUsageRunObservation[],
 claimedInvoiceFen:number|null,policy:ModelCostPolicy
):QuotedCostCheck{
 if(!idOk(provider,80)||!idOk(model,120))throw new Error("Invalid billing scope");
 if(!Array.isArray(observations)||observations.length===0||observations.length>10000)
  throw new Error("Invalid billing observation count");
 if(!int(policy.inputFenPerMillion,100000000)||policy.inputFenPerMillion===0||
    !int(policy.outputFenPerMillion,100000000)||policy.outputFenPerMillion===0||
    !int(policy.maxRequestFen,100000)||policy.maxRequestFen===0)
  throw new Error("Invalid approved pricing policy");
 if(claimedInvoiceFen!==null&&!int(claimedInvoiceFen,2147483647))
  throw new Error("Invalid billed amount");
 const seen=new Set<string>();
 const reasons=new Set<string>();
 let cost=0n,priced=0,unknown=0,over=0;
 for(const entry of observations){
  if(!entry||!idOk(entry.runId,64)||!entry.usage)
   throw new Error("Invalid billing observation");
  if(seen.has(entry.runId))throw new Error("Duplicate model run in billed period");
  seen.add(entry.runId);
  const u=entry.usage;
  if(u.provider!==provider||u.model!==model)throw new Error("Unexpected billing scope");
  if(!["REPORTED","UNREPORTED","INVALID"].includes(u.status))
   throw new Error("Invalid usage status");
  if(u.status!=="REPORTED"){
   if(u.inputTokens!==null||u.outputTokens!==null||
      u.reportedTotalTokens!==null||u.costFen!==null||u.overBudget!==false)
    throw new Error("Contradictory unreported model usage");
   unknown++;
   reasons.add(u.status==="INVALID"?"INVALID_USAGE":"MISSING_USAGE");
   continue;
  }
  if(!int(u.inputTokens,1000000)||!int(u.outputTokens,1000000)||
     (u.reportedTotalTokens!==null&&(
       !int(u.reportedTotalTokens,1000000)||
       u.reportedTotalTokens!==u.inputTokens+u.outputTokens))||
     !int(u.costFen,2147483647)||typeof u.overBudget!=="boolean")
    throw new Error("Contradictory reported model usage");
  const recalculated=(BigInt(u.inputTokens)*BigInt(policy.inputFenPerMillion)+
    BigInt(u.outputTokens)*BigInt(policy.outputFenPerMillion)+999999n)/1000000n;
  if(recalculated!==BigInt(u.costFen)||u.overBudget!==(recalculated>BigInt(policy.maxRequestFen)))
   throw new Error("Quoted amount differs from approved pricing policy");
  cost+=recalculated;
  priced++;
  if(u.overBudget){over++;reasons.add("OVER_BUDGET");}
 }
 if(cost>2147483647n)throw new Error("Quoted cost aggregate exceeds bounds");
 if(claimedInvoiceFen===null)reasons.add("MISSING_INVOICE");
 const knownQuotedFen=Number(cost);
 let diff:number|null=null;
 if(unknown===0&&claimedInvoiceFen!==null){
  diff=knownQuotedFen-claimedInvoiceFen;
  if(diff!==0)reasons.add("AMOUNT_DIFFERENCE");
 }
 const reasonCodes=[...reasons].sort();
 return {
  status:reasonCodes.length?"REVIEW_REQUIRED":"INPUT_MATCH",
  reasonCodes,provider,model,runCount:observations.length,
  pricedRunCount:priced,unknownRunCount:unknown,
  overBudgetRunCount:over,knownQuotedFen,
  claimedInvoiceFen,differenceFen:diff
 };
}
