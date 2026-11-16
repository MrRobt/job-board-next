"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword,verifyPassword } from "@/lib/password";
import { startSession,endSession } from "@/lib/auth";
import { allowAttempt } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
const credentials=z.object({email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(12).max(128)});
export async function login(form:FormData){
 const input=credentials.safeParse(Object.fromEntries(form));
 if(!input.success)redirect("/login?error=1");
 if(!await allowAttempt("login",input.data.email,8,15))redirect("/login?error=1");
 const user=await db.user.findUnique({where:{email:input.data.email}});
 if(!user||!verifyPassword(input.data.password,user.passwordHash))redirect("/login?error=1");
 await startSession(user.id); redirect("/");
}
export async function register(form:FormData){
 const input=credentials.safeParse(Object.fromEntries(form));
 if(!input.success)redirect("/register?error=1");
 if(!await allowAttempt("register",input.data.email,3,60))redirect("/register?error=1");
 const existing=await db.user.findUnique({where:{email:input.data.email}});
 if(existing)redirect("/register?error=1");
 let id:string;
 try {const user=await db.user.create({data:{email:input.data.email,passwordHash:hashPassword(input.data.password)}});id=user.id;}catch{redirect("/register?error=1");}
 await startSession(id);redirect("/");
}
export async function logout(){await endSession();redirect("/");}
