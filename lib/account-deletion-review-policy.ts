/** Read-only indicators, never authorization to erase a real person or financial evidence. */
export type DeletionExposure={
 realToolOrders:number;
 pendingToolOrders:number;
 legacyOrders:number;
 refundCases:number;
 refundIntents:number;
 refundDispatches:number;
 reservedRuns:number;
 activeGrants:number;
 applications:number;
};
export type ReviewDisposition="EVIDENCE_UNAVAILABLE"|"FINANCIAL_HOLD"|"OPERATIONAL_HOLD"|"MANUAL_REVIEW";
export type DeletionReviewAssessment={disposition:ReviewDisposition;reasons:string[];canAutoDelete:false};
const financialKeys=["realToolOrders","pendingToolOrders","legacyOrders","refundCases","refundIntents","refundDispatches"] as const;
const operationalKeys=["reservedRuns","activeGrants"] as const;
const personalKeys=["applications"] as const;
export function assessDeletionReviewExposure(exposure:DeletionExposure):DeletionReviewAssessment{
 const counts=Object.entries(exposure);
 if(counts.length!==9||counts.some(([,n])=>!Number.isSafeInteger(n)||n<0)){
  return {disposition:"EVIDENCE_UNAVAILABLE",reasons:["INCOMPLETE_RISK_EVIDENCE"],canAutoDelete:false};
 }
 const reasons=([ ...financialKeys,...operationalKeys,...personalKeys] as Array<keyof DeletionExposure>)
  .filter(key=>exposure[key]>0).map(key=>key.toUpperCase());
 const financial=financialKeys.some(key=>exposure[key]>0);
 const operational=operationalKeys.some(key=>exposure[key]>0);
 return {
  disposition:financial?"FINANCIAL_HOLD":operational?"OPERATIONAL_HOLD":"MANUAL_REVIEW",
  reasons,canAutoDelete:false
 };
}
