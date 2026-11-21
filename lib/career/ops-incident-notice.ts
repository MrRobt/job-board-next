/** A URL parameter is untrusted. Never render an affirmative incident
 * acknowledgment from a GET query string; only the durable incident state
 * and transactional audit can prove an operation occurred.
 */
export function opsIncidentOutcomeNotice(outcome:unknown):string|null{
 if(typeof outcome!=="string"||outcome.length===0)return null;
 return "事故操作请求已返回。请以当前事故状态和审计记录为准；此提示不代表确认已成功。";
}
