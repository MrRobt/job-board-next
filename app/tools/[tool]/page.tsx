import {randomUUID} from "node:crypto";
import {liveAvailable} from "@/lib/career/provider";
import {trial,available} from "@/lib/career/credits";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import CareerForm from "@/components/CareerForm";
export default async function Tool({params}:{params:Promise<{tool:string}>}){const {tool}=await params;if(tool!=="resume"&&tool!=="interview")notFound();const user=await requireUser();await trial(user.id);return <section className="top"><h1>{tool==="resume"?"AI 简历诊断":"AI 模拟面试"}</h1><p className="muted">基于本人真实经历，独立练习并改进表达。</p><CareerForm tool={tool} live={liveAvailable()} provider={process.env.AI_PROVIDER_NAME??""} privacy={process.env.AI_PRIVACY_NOTICE_URL??""} credits={await available(user.id)} requestId={randomUUID()}/></section>;}
