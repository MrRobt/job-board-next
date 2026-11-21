/** Separate operational visibility from administrator mutations.
 * Neither flag enables payment, AI execution, notification, or data collection.
 * These gates are evaluated on the server only, and default to false.
 */
export type OpsIncidentGateState=Readonly<{
 canRead:boolean;
 canAcknowledge:boolean;
}>;
export function opsIncidentGates(env:Readonly<Record<string,string|undefined>>):OpsIncidentGateState{
 const canAcknowledge=env.ENABLE_OPS_INCIDENT_ACK==="true";
 return {
  canRead:env.ENABLE_OPS_INCIDENT_READ==="true"||canAcknowledge,
  canAcknowledge
 };
}
