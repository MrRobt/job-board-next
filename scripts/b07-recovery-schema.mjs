/** Required data structures for read-only B07 recovery assessment.
 * Kept independent of DB I/O so missing tables/columns can be tested offline.
 */
export const requiredRecoveryTables=Object.freeze([
 "_prisma_migrations","User","ToolOrder","ToolGrant","ToolRun",
 "ToolRefundCase","ToolRefundIntent","ToolRefundDispatch","ToolRefundInquiryEvent",
 "OpsAlertIncident","OpsAlertIncidentEvent","OpsIncidentNotificationIntent",
 "OpsNotificationFailureEvent","OpsNotificationDeadReview"
]);

export const requiredRecoveryColumns=Object.freeze([
 "ToolOrder.status","ToolOrder.refundHold","ToolGrant.remaining",
 "ToolRefundIntent.fingerprint","ToolRefundIntent.approvedById",
 "ToolRefundIntent.approvedAt","ToolRefundDispatch.state",
 "ToolRefundDispatch.outRefundNo","ToolRefundDispatch.claimedAt",
 "ToolRefundDispatch.confirmedAt","ToolRefundInquiryEvent.outcome",
 "OpsAlertIncident.state","OpsAlertIncident.openedAt",
 "OpsAlertIncidentEvent.action",
 "OpsIncidentNotificationIntent.state","OpsIncidentNotificationIntent.claimToken",
 "OpsIncidentNotificationIntent.leaseExpiresAt",
 "OpsNotificationFailureEvent.failureCode","OpsNotificationDeadReview.reviewedAt"
]);

/** Prisma information_schema metadata only; no SQL statements or mutations. */
export function inspectCriticalRecoverySchema(tables,columns){
 if(!Array.isArray(tables)||!Array.isArray(columns))throw Error("Invalid schema metadata");
 const names=new Set(tables.map(row=>row.tableName));
 const types=new Map(columns.map(row=>[row.tableName+"."+row.columnName,row.dataType]));
 return {
  missingTables:requiredRecoveryTables.filter(table=>!names.has(table)),
  missingColumns:requiredRecoveryColumns.filter(col=>!types.has(col)),
  unexpectedAmountTypes:[
   ["ToolOrder","amountFen"],["ToolRefundIntent","amountFen"]
  ].filter(([table,col])=>types.has(table+"."+col)&&
   !["int","bigint"].includes(types.get(table+"."+col)))
 };
}
