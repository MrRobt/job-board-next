import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {resolveReport} from "@/app/actions/report";
export default async function Reports(){await requireAdmin();const reports=await db.report.findMany({where:{status:"OPEN"},orderBy:{createdAt:"asc"},take:100});return <><h1>举报处理</h1>{reports.map(r=><article className="card" key={r.id}><Link href={"/admin/jobs/"+r.jobId}>查看被举报岗位</Link><p>{r.reason} · {r.createdAt.toISOString().slice(0,10)}</p><p className="content">{r.description}</p><div className="row"><form action={resolveReport.bind(null,r.id,false)}><button className="quiet">核查完成</button></form><form action={resolveReport.bind(null,r.id,true)}><button>下架并完成</button></form></div></article>)}{!reports.length&&<p>暂无待处理举报。</p>}</>}