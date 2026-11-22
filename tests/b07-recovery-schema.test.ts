import {test} from "node:test";
import assert from "node:assert/strict";
import {
 requiredRecoveryTables,requiredRecoveryColumns,inspectCriticalRecoverySchema
} from "../scripts/b07-recovery-schema.mjs";

const operational=[
 "OpsAlertIncident","OpsAlertIncidentEvent","OpsIncidentNotificationIntent",
 "OpsNotificationFailureEvent","OpsNotificationDeadReview"
];

test("B07 recovery policy includes durable incident, notification and review tables",()=>{
 for(const table of operational){
  assert.ok(requiredRecoveryTables.includes(table),`Recovery blind spot: ${table}`);
 }
 for(const column of [
  "OpsAlertIncident.state","OpsAlertIncident.openedAt",
  "OpsIncidentNotificationIntent.state","OpsIncidentNotificationIntent.claimToken",
  "OpsNotificationFailureEvent.failureCode","OpsNotificationDeadReview.reviewedAt"
 ]){
  assert.ok(requiredRecoveryColumns.includes(column),`Recovery blind column: ${column}`);
 }
});

test("B07 schema inspection fails closed on absent operational tables and columns",()=>{
 const tables=requiredRecoveryTables.map(tableName=>({tableName}));
 const columns=requiredRecoveryColumns.map(key=>{
  const [tableName,columnName]=key.split(".");
  return {tableName,columnName,dataType:"varchar"};
 });
 columns.push({tableName:"ToolOrder",columnName:"amountFen",dataType:"int"});
 columns.push({tableName:"ToolRefundIntent",columnName:"amountFen",dataType:"int"});
 const good=inspectCriticalRecoverySchema(tables,columns);
 assert.deepEqual(good,{missingTables:[],missingColumns:[],unexpectedAmountTypes:[]});
 const missing=inspectCriticalRecoverySchema(
  tables.filter(row=>row.tableName!=="OpsNotificationFailureEvent"),
  columns.filter(row=>!(row.tableName==="OpsIncidentNotificationIntent"&&row.columnName==="claimToken"))
 );
 assert.ok(missing.missingTables.includes("OpsNotificationFailureEvent"));
 assert.ok(missing.missingColumns.includes("OpsIncidentNotificationIntent.claimToken"));
 const corrupt=inspectCriticalRecoverySchema(tables,columns.map(row=>
  row.tableName==="ToolOrder"&&row.columnName==="amountFen"?{...row,dataType:"varchar"}:row
 ));
 assert.deepEqual(corrupt.unexpectedAmountTypes,[["ToolOrder","amountFen"]]);
});
