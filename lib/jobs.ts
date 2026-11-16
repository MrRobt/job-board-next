import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";
export const publicJob = { id:true,title:true,company:true,city:true,salary:true,employment:true,summary:true,priceFen:true,featured:true,publishedAt:true,category:{select:{name:true}} } as const satisfies Prisma.JobSelect;
export function visibleJobs(): Prisma.JobWhereInput {
 return {status:"PUBLISHED",OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]};
}
export function formatPrice(fen:number){return (fen/100).toFixed(2);}
export async function getPublicJob(id:string){return db.job.findFirst({where:{id,...visibleJobs()},select:publicJob});}
export async function getJobDetails(id:string,userId?:string){
 return db.job.findFirst({where:{id,...visibleJobs(),AND:[{OR:[{priceFen:0},...(userId?[{unlocks:{some:{userId}}}]:[])]}]},select:{details:true,sourceUrl:true}});
}
