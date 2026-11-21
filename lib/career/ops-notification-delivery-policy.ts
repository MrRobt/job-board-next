/** Fail-closed transport admission policy. This module NEVER sends a notification.
 * Dispatch must separately verify a live claim lease, provider idempotency,
 * and an approved delivery destination immediately before any network I/O.
 */
export type OpsNotificationDeliveryDecision =
  | Readonly<{allowed:true; destination:string}>
  | Readonly<{allowed:false;reason:"DISABLED"|"UNAPPROVED"|"INVALID_DESTINATION"|"NOT_ALLOWLISTED"}>;

function parseEndpoint(value:string):string|null {
  if(value.length>2048 || value.trim()!==value) return null;
  try {
    const url=new URL(value);
    if(url.protocol!=="https:" || url.username || url.password ||
      url.port || url.search || url.hash || url.pathname!=="/" ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) ||
      !url.hostname.includes(".") || url.hostname.endsWith(".") ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) ||
      url.hostname.includes(":")) return null;
    return url.origin;
  } catch { return null; }
}

/** Exact-origin approval, not a suffix match; no environment defaults. */
export function authorizeOpsNotificationDelivery(input:Readonly<{
  enabled:string|undefined;
  operatorApproved:string|undefined;
  destination:string|undefined;
  approvedOrigins:readonly string[];
}>):OpsNotificationDeliveryDecision {
  if(input.enabled!=="true")return {allowed:false,reason:"DISABLED"};
  if(input.operatorApproved!=="true")return {allowed:false,reason:"UNAPPROVED"};
  const destination=input.destination && parseEndpoint(input.destination);
  if(!destination)return {allowed:false,reason:"INVALID_DESTINATION"};
  if(!input.approvedOrigins.some(origin=>parseEndpoint(origin)===destination && origin===destination))
    return {allowed:false,reason:"NOT_ALLOWLISTED"};
  return {allowed:true,destination};
}
