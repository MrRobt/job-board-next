"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
const jobInput=z.object({title:z.string().trim().min(1).max(160),company:z.string().trim().min(1).max(160),city:z.string().trim().min(1).max(80),employment:z.string().trim().min(1).max(40),salary:z.string().trim().min(1).max(80),categoryId:z.string().min(1).max(100),summary:z.string().trim().min(1).max(2000),details:z.string().trim().min(1).max(20000),sourceUrl:z.string().max(2048).refine(v=>{try{return ["http:","https:"].includes(new URL(v).protocol)}catch{return false}}),priceFen:z.coerce.number().int().min(0).max(100000),status:z.enum(["DRAFT","PUBLISHED","ARCHIVED"]),featured:z.boolean()});
function refresh(){revalidatePath("/");revalidatePath("/admin/jobs");revalidatePath("/jobs/[id]","page");}
export async function saveJob(id:string|null,form:FormData){await requireAdmin();const parsed=jobInput.safeParse({...Object.fromEntries(form),featured:form.get("featured")==="on"});if(!parsed.success)redirect("/admin/jobs/"+(id??"new")+"?error=1");const data=parsed.data;const category=await db.category.findUnique({where:{id:data.categoryId}});if(!category)redirect("/admin/jobs/"+(id??"new")+"?error=1");if(id){const existing=await db.job.findUniqueOrThrow({where:{id}});await db.job.update({where:{id},data:{...data,publishedAt:data.status==="PUBLISHED"?(existing.publishedAt??new Date()):existing.publishedAt}});}else{await db.job.create({data:{...data,publishedAt:data.status==="PUBLISHED"?new Date():null}});}refresh();redirect("/admin/jobs");}
export async function archiveJob(id:string){await requireAdmin();await db.job.update({where:{id},data:{status:"ARCHIVED"}});refresh();}
export async function addCategory(form:FormData){await requireAdmin();const name=z.string().trim().min(1).max(80).parse(form.get("name"));await db.category.upsert({where:{name},create:{name},update:{}});revalidatePath("/admin/categories");revalidatePath("/");}
export async function renameCategory(id:string,form:FormData){await requireAdmin();const name=z.string().trim().min(1).max(80).parse(form.get("name"));await db.category.update({where:{id},data:{name}});revalidatePath("/admin/categories");revalidatePath("/");}
