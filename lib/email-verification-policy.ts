import {createHash,randomBytes} from "node:crypto";

const tokenPattern=/^[a-f0-9]{64}$/;
export const VERIFICATION_TOKEN_LIFETIME_MS=24*60*60*1000;

/** The raw bearer secret exists only in transient process memory and a delivery link. */
export function makeVerificationToken():string{
 return randomBytes(32).toString("hex");
}
export function validVerificationToken(value:unknown):value is string{
 return typeof value==="string"&&tokenPattern.test(value);
}
export function hashVerificationToken(value:string):string{
 if(!validVerificationToken(value))throw new Error("Invalid verification token");
 return createHash("sha256").update(value).digest("hex");
}
export function verificationExpiresAt(now:Date=new Date()):Date{
 if(!Number.isFinite(now.getTime()))throw new Error("Invalid verification time");
 return new Date(now.getTime()+VERIFICATION_TOKEN_LIFETIME_MS);
}
