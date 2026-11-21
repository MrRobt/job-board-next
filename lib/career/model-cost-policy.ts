/**
 * Fail-closed per-call model cost admission.
 * Operators must supply integer fen-per-million-token rates for their approved
 * provider and an integer fen per-request budget. The byte-based upper estimate
 * is deliberately conservative for common byte-level tokenizers, but it is
 * NOT a substitute for actual provider billing/usage reconciliation.
 */
export type ModelCostPolicy={
 inputFenPerMillion:number;
 outputFenPerMillion:number;
 maxRequestFen:number;
};
function integerConfig(raw:string|undefined,name:string,allowZero:boolean){
 if(raw===undefined||!/^(0|[1-9][0-9]*)$/.test(raw))throw new Error("Missing or invalid model cost policy: "+name);
 const n=Number(raw);
 if(!Number.isSafeInteger(n)||n>(name==="AI_MAX_REQUEST_COST_FEN"?100000:100000000)||
    (!allowZero&&n===0))throw new Error("Invalid model cost policy: "+name);
 return n;
}
export function readModelCostPolicy(env:Readonly<Record<string,string|undefined>>=process.env):ModelCostPolicy{
 return {
  inputFenPerMillion:integerConfig(env.AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS,
   "AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS",false),
  outputFenPerMillion:integerConfig(env.AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS,
   "AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS",false),
  maxRequestFen:integerConfig(env.AI_MAX_REQUEST_COST_FEN,"AI_MAX_REQUEST_COST_FEN",false)
 };
}
export function checkModelRequestBudget(body:unknown,maxOutputTokens:number,policy:ModelCostPolicy){
 if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>8192)
  throw new Error("Invalid model output limit");
 const raw=JSON.stringify(body);
 if(typeof raw!=="string")throw new Error("Invalid model request payload");
 const bytes=Buffer.byteLength(raw,"utf8");
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>100000)
  throw new Error("Model request input size limit exceeded");
 // Allow for system-message framing, unseen provider template tokens etc.
 const inputEstimate=BigInt(bytes+1024);
 const outputEstimate=BigInt(maxOutputTokens);
 const numerator=inputEstimate*BigInt(policy.inputFenPerMillion)+
   outputEstimate*BigInt(policy.outputFenPerMillion);
 const fen=(numerator+999999n)/1000000n;
 if(fen>BigInt(policy.maxRequestFen))
  throw new Error("Projected model request exceeds operator cost limit");
 return {inputTokenUpperEstimate:Number(inputEstimate),projectedMaxCostFen:Number(fen)};
}
