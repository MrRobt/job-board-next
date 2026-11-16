import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getPublicJob,getJobDetails,formatPrice } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export default async function Job({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const [job,user]=await Promise.all([getPublicJob(id),currentUser()]);
 if(!job)notFound();
 const details=await getJobDetails(id,user?.id);
 return <article className="card top"><Link href="/">← 返回招聘列表</Link><h1>{job.title}</h1><p className="muted">{job.company} · {job.city} · {job.category.name} · {job.employment}</p><p className="salary">{job.salary}</p><h2>岗位简介</h2><p className="content">{job.summary}</p>{details?<><h2>完整招聘信息</h2><p className="content">{details.details}</p>{/^https?:\/\//i.test(details.sourceUrl)&&<a className="button" rel="noopener noreferrer" target="_blank" href={details.sourceUrl}>前往原始招聘页面</a>}</>:<section className="card"><h2>完整信息需付费解锁</h2><p>解锁价格：¥{formatPrice(job.priceFen)}。请先确认信息适合你，付费不保证录用。</p>{user?<Link className="button" href={"/checkout/"+id}>查看解锁方式</Link>:<Link className="button" href="/login">登录后解锁</Link>}</section>}</article>;
}