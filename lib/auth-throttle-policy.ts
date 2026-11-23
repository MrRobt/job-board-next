import {trustedClientIp} from "./trusted-client-ip";

export type AuthenticationThrottleOptions={
 scope:"login"|"register"|"verify"|"verify-resend"|"password-reset-request"|"password-reset-confirm";
 identity:string;
 emailLimit:number;
 ipLimit:number;
 minutes:number;
 nodeEnv:string|undefined;
 configuredHeader:string|undefined;
 headers:Pick<Headers,"get">;
};
export type AttemptLimiter=(
 scope:string,identity:string,limit:number,minutes:number
)=>Promise<boolean>;

/**
 * Production must have a trusted, single-source client IP so attackers cannot
 * evade account-creation throttles by rotating email addresses. The reverse
 * proxy MUST overwrite the chosen header and block direct origin access.
 *
 * A missing/malformed trusted header, a throttle denial or a database error
 * always refuses authentication. Development may retain email-only throttling.
 */
export async function checkAuthenticationThrottle(
 options:AuthenticationThrottleOptions,allowAttempt:AttemptLimiter
):Promise<boolean>{
 const {scope,identity,emailLimit,ipLimit,minutes,nodeEnv,configuredHeader,headers}=options;
 if(nodeEnv==="production"&&!configuredHeader)return false;
 const ip=configuredHeader?trustedClientIp(headers,configuredHeader):null;
 if(configuredHeader&&!ip)return false;
 try{
  if(!await allowAttempt(scope,identity,emailLimit,minutes))return false;
  return ip?await allowAttempt(scope+"-trusted-ip",ip,ipLimit,minutes):true;
 }catch{
  // Never silently disable authentication abuse protection on DB errors.
  return false;
 }
}
