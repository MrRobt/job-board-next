export const PASSWORD_RESET_LIFETIME_MS=30*60*1000;

export function passwordResetExpiresAt(now:Date=new Date()):Date{
 if(!Number.isFinite(now.getTime()))throw new Error("Invalid reset time");
 return new Date(now.getTime()+PASSWORD_RESET_LIFETIME_MS);
}
export function validPasswordResetInput(value:unknown):value is string{
 return typeof value==="string"&&value.length>=12&&value.length<=128;
}
