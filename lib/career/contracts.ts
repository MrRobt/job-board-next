import { z } from "zod";
export const kinds=["resume","questions","feedback"] as const;
export type Kind=(typeof kinds)[number];
export const titles={resume:"简历诊断",questions:"生成面试练习题",feedback:"面试回答反馈"};
export const input=z.object({
 kind:z.enum(kinds),role:z.string().trim().min(2).max(120),context:z.string().trim().max(5000),text:z.string().trim().max(8000)
}).superRefine((v,c)=>{if(v.kind!=="questions"&&v.text.length<20)c.addIssue({code:"custom",path:["text"],message:"请输入至少20字的材料"});if(v.kind==="feedback"&&v.context.length<5)c.addIssue({code:"custom",path:["context"],message:"请输入面试问题"});});
export type Input=z.infer<typeof input>;
export const output=z.object({summary:z.string().min(1).max(800),sections:z.array(z.object({title:z.string().min(1).max(80),items:z.array(z.string().min(1).max(900)).min(1).max(8)})).min(2).max(6),next:z.array(z.string().min(1).max(500)).min(1).max(6)});
export type Output=z.infer<typeof output>;
export function hasContact(v:string){return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(v)||/(?:^|\D)1[3-9]\d{9}(?!\d)/.test(v)||/(?:^|\D)\d{17}[\dXx](?!\d)/.test(v);}
