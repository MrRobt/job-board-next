"use server";
import {requireUser} from "@/lib/auth";
import {allowAttempt} from "@/lib/rate-limit";
import {input,hasContact,type Output} from "@/lib/career/contracts";
import {z} from "zod";
import {liveAvailable,generate} from "@/lib/career/provider";
import {reserve,finish,available} from "@/lib/career/credits";
import {sample} from "@/lib/career/sample";
export type PracticeState={error?:string;report?:Output;mode?:"sample"|"ai";remaining?:number};
export async function practice(_previous:PracticeState,form:FormData):Promise<PracticeState>{
 const user=await requireUser();const v=input.safeParse(Object.fromEntries(form));
 if(!v.success)return {error:"请检查目标岗位、问题与材料长度。"};
 if(hasContact([v.data.role,v.data.context,v.data.text].join("\n")))return {error:"检测到可能的联系方式或身份证号，请先脱敏。"};
 if(!await allowAttempt("career-practice",user.id,30,60))return {error:"操作频繁，请稍后再试。"};
 if(form.get("mode")!=="ai")return {report:sample(v.data),mode:"sample",remaining:await available(user.id)};
 if(!liveAvailable())return {error:"真实 AI 尚未开放。"};
 if(form.get("consent")!=="on")return {error:"请阅读模型说明并确认本次数据处理。"};
 const request=z.string().uuid().safeParse(form.get("requestId"));if(!request.success)return {error:"请求标识无效，请刷新页面。"};
 let id:string;
 try{const r=await reserve(user.id,request.data,v.data.kind);if(r.state!=="reserved")return {error:r.state==="empty"?"可用次数不足。":"请求已处理或正在进行，请查看账户。",remaining:await available(user.id)};id=r.id;}catch{return {error:"暂时无法预留次数，请稍后试。"};}
 let report:Output;
 try{report=await generate(v.data);}catch{try{await finish(id,false);}catch{return {error:"模型调用失败，次数返还待核对。"};}return {error:"模型调用失败，已返还本次次数。",remaining:await available(user.id)};}
 try{if(!await finish(id,true))return {error:"调用状态异常，请联系支持。"};}catch{return {error:"调用状态待核实，请联系支持。"};}
 return {report,mode:"ai",remaining:await available(user.id)};
}
