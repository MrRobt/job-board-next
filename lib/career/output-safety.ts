import {hasContact,output,type Output} from "./contracts";

/** Model-generated reports are text-only; never introduce outbound destinations.
 * Normalization catches common full-width and zero-width URL obfuscation.
 * This is a conservative link filter, not a complete anti-phishing classifier.
 */
export function hasExternalDestination(value:string):boolean{
 const normalized=value.normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"");
 return /\b(?:https?|ftp):\s*\/\s*\//i.test(normalized)||
  /\b(?:mailto|tel|sms):\s*\S+/i.test(normalized)||
  /(?:^|[^\p{L}\p{N}_])www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/iu.test(normalized)||
  // Bare domain detection uses recognized public suffixes. Broad .xx matching
  // would incorrectly block technical terms such as Node.js or Python.py.
  /(?:^|[^\p{L}\p{N}_@.])(?:[a-z0-9-]+\.)+(?:com|cn|org|net|edu|gov|io|ai|app|dev|info|biz|co|me|xyz|site|top|online|cloud|tech|link|shop|pro|us|uk|jp|de|fr|ru|in|cc)(?=$|[^a-z0-9-])/iu.test(normalized);
}

/**
 * Check the entire model-generated report before returning it to a user.
 * Prompt instructions alone cannot guarantee that a provider won't emit
 * contact details. Never echo the rejected text in errors or logs.
 */
export function validateSafeModelOutput(raw:unknown):Output{
 const report=output.parse(raw);
 const fields=[
  report.summary,
  ...report.sections.flatMap(section=>[section.title,...section.items]),
  ...report.next
 ];
 if(fields.some(hasContact)){
  throw new Error("Model output contains sensitive contact details");
 }
 if(fields.some(hasExternalDestination)){
  throw new Error("Model output contains an external link");
 }
 return report;
}
