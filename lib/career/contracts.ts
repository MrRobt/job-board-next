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
/**
 * Fail closed before career text leaves the app. NFKC catches common full-width
 * forms; allow only short in-line phone separators (not arbitrary newlines).
 * This is a conservative format filter, not exhaustive PII detection.
 */
export function hasContact(value:string){
 const text=value.normalize("NFKC");
 const email=/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
 const mobile=/(?<!\d)(?:\+?86[ \t.()-]{0,4})?1[3-9](?:[ \t.()-]{0,4}\d){9}(?!\d)/;
 const mainlandId=/(?<!\d)[1-9]\d{5}[ \t-]*\d{8}[ \t-]*\d{3}[\dXx](?![\dXx])/;
 return email.test(text)||mobile.test(text)||mainlandId.test(text);
}
