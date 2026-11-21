import {hasContact,output,type Output} from "./contracts";

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
 return report;
}
