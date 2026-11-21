import type {ModelCostPolicy} from "./model-cost-policy";

/** Provider-reported usage is evidence, not a final invoice. No prompt or output text is persisted. */
export type ModelUsageEvidence={
 provider:string;model:string;
 status:"REPORTED"|"UNREPORTED"|"INVALID";
 inputTokens:number|null;outputTokens:number|null;
 reportedTotalTokens:number|null;costFen:number|null;overBudget:boolean;
};
const validCount=(value:unknown)=>typeof value==="number"&&
 Number.isSafeInteger(value)&&value>=0&&value<=1_000_000;
const boundedIdentity=(value:string,max:number)=>{
 if(!value||value.length>max||/[^\x20-\x7e]/.test(value))throw new Error("Invalid model billing identity");
 return value;
};
export function modelUsageEvidence(
 raw:unknown,provider:string,model:string,policy:ModelCostPolicy
):ModelUsageEvidence{
 boundedIdentity(provider,80);boundedIdentity(model,120);
 const basic={provider,model,inputTokens:null,outputTokens:null,
  reportedTotalTokens:null,costFen:null,overBudget:false};
 if(raw===undefined||raw===null)return {...basic,status:"UNREPORTED"};
 if(typeof raw!=="object"||Array.isArray(raw))return {...basic,status:"INVALID"};
 const value=raw as Record<string,unknown>;
 const input=value.prompt_tokens,output=value.completion_tokens,total=value.total_tokens;
 if(!validCount(input)||!validCount(output)||
    (total!==undefined&&(!validCount(total)||total!==(input as number)+(output as number))))
  return {...basic,status:"INVALID"};
 const costBig=(BigInt(input as number)*BigInt(policy.inputFenPerMillion)+
   BigInt(output as number)*BigInt(policy.outputFenPerMillion)+999999n)/1000000n;
 if(costBig>2147483647n)return {...basic,status:"INVALID"};
 return {provider,model,status:"REPORTED",inputTokens:input as number,
  outputTokens:output as number,reportedTotalTokens:total===undefined?null:total as number,
  costFen:Number(costBig),overBudget:costBig>BigInt(policy.maxRequestFen)};
}
