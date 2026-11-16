"use server";
import {requireUser} from "@/lib/auth";
import {allowAttempt} from "@/lib/rate-limit";
import {input,hasContact,type Output} from "@/lib/career/contracts";
import {sample} from "@/lib/career/sample";
export type PracticeState={error?:string;report?:Output;mode?:"sample"|"ai";remaining?:number};
export async function practice(_previous:PracticeState,form:FormData):Promise<PracticeState>{
 const user=await requireUser();const v=input.safeParse(Object.fromEntries(form));
 if(!v.success)return {error:"请检查目标岗位、问题与材料长度。"};
 if(hasContact([v.data.role,v.data.context,v.data.text].join("\n")))return {error:"检测到可能的联系方式或身份证号，请先脱敏。"};
 if(!await allowAttempt("career-practice",user.id,30,60))return {error:"操作频繁，请稍后再试。"};
 return {report:sample(v.data),mode:"sample"};
}
