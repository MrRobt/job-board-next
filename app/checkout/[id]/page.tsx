import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {getPublicJob,formatPrice} from "@/lib/jobs";
export default async function Checkout({params}:{params:Promise<{id:string}>}){await requireUser();const {id}=await params;const job=await getPublicJob(id);if(!job)notFound();return <section className="card top"><h1>解锁招聘信息</h1><p>{job.title} · ¥{formatPrice(job.priceFen)}</p><p className="muted">支付宝与微信支付尚未开放，当前不会收取任何费用。</p><Link href={"/jobs/"+id}>返回详情</Link></section>}