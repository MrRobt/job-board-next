"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword,verifyPassword } from "@/lib/password";
import { startSession,endSession } from "@/lib/auth";
import { allowAttempt } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { trustedClientIp } from "@/lib/trusted-client-ip";
const credentials=z.object({email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(12).max(128)});
async function authenticationAllowed(scope:"login"|"register",email:string,emailLimit:number,ipLimit:number,minutes:number){
 const emailAllowed=await allowAttempt(scope,email,emailLimit,minutes);
 // Enable only behind a reverse proxy that overwrites this header and blocks direct origin access.
 const configured=process.env.TRUSTED_CLIENT_IP_HEADER;
 if(!configured)return emailAllowed;
 const ip=trustedClientIp(await headers(),configured);
 if(!ip)return false; // Fail closed for misconfigured or ambiguous proxy headers.
 const ipAllowed=await allowAttempt(scope+"-trusted-ip",ip,ipLimit,minutes);
 return emailAllowed&&ipAllowed;
}
export async function login(form:FormData){
 const input=credentials.safeParse(Object.fromEntries(form));
 if(!input.success)redirect("/login?error=1");
 if(!await authenticationAllowed("login",input.data.email,8,60,15))redirect("/login?error=1");
 const user=await db.user.findUnique({where:{email:input.data.email}});
 if(!user||!await verifyPassword(input.data.password,user.passwordHash))redirect("/login?error=1");
 await startSession(user.id); redirect("/");
}
export async function register(form:FormData){
 const input=credentials.safeParse(Object.fromEntries(form));
 if(!input.success)redirect("/register?error=1");
 if(!await authenticationAllowed("register",input.data.email,3,12,60))redirect("/register?error=1");
 const existing=await db.user.findUnique({where:{email:input.data.email}});
 if(existing)redirect("/register?error=1");
 let id:string;
 try {const user=await db.user.create({data:{email:input.data.email,passwordHash:await hashPassword(input.data.password)}});id=user.id;}catch{redirect("/register?error=1");}
 await startSession(id);redirect("/");
}
export async function logout(){await endSession();redirect("/");}
