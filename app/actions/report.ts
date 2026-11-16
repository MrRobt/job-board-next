"use server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireUser,requireAdmin} from "@/lib/auth";
import {getPublicJob} from "@/lib/jobs";
import {allowAttempt} from "@/lib/rate-limit";
import {redirect,notFound} from "next/navigation";
import {revalidatePath} from "next/cache";
export async function reportJob(id:string,form:FormData){const user=await requireUser();if(!await getPublicJob(id))notFound();const parsed=z.object({reason:z.enum(["FRAUD","EXPIRED","WRONG","OTHER"]),description:z.string().trim().min(1).max(1000)}).safeParse(Object.fromEntries(form));if(!parsed.success||!await allowAttempt("report",user.id,10,60))redirect("/report/"+id+"?error=1");await db.report.upsert({where:{jobId_userId:{jobId:id,userId:user.id}},create:{jobId:id,userId:user.id,...parsed.data},update:{...parsed.data,status:"OPEN"}});redirect("/report/"+id+"?ok=1");}
export async function resolveReport(id:string,archive:boolean){await requireAdmin();await db.$transaction(async tx=>{const report=await tx.report.findUniqueOrThrow({where:{id}});if(archive)await tx.job.update({where:{id:report.jobId},data:{status:"ARCHIVED"}});await tx.report.update({where:{id},data:{status:"RESOLVED"}});});revalidatePath("/admin/reports");revalidatePath("/");revalidatePath("/jobs/[id]","page");}
