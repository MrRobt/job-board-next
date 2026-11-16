import Link from "next/link";
import { db } from "@/lib/db";
import { publicJob,visibleJobs,formatPrice } from "@/lib/jobs";
export default async function Home({searchParams}:{searchParams:Promise<{q?:string;category?:string;page?:string}>}){
 const query=await searchParams;
 const q=typeof query.q==="string"?query.q.trim().slice(0,100):"";
 const category=typeof query.category==="string"?query.category:"";
 const page=Math.min(1000,Math.max(1,Math.floor(Number(query.page)||1)));
 const where={...visibleJobs(),...(category?{categoryId:category}:{}),...(q?{AND:[{OR:[{title:{contains:q}},{company:{contains:q}},{city:{contains:q}}]}]}:{})};
 const [categories,jobs,total]=await Promise.all([db.category.findMany({orderBy:{name:"asc"}}),db.job.findMany({where,select:publicJob,orderBy:[{featured:"desc"},{publishedAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20}),db.job.count({where})]);
 const url=(id:string,p=1)=>"/?"+new URLSearchParams({q,category:id,page:String(p)});
 return <><section className="hero"><h1>发现更好的工作机会</h1><p className="muted">汇集各行业招聘信息，让求职更加高效。</p><form className="search"><input name="q" placeholder="搜索岗位、公司、城市" defaultValue={q}/><input type="hidden" name="category" value={category}/><button>搜索招聘</button></form></section><div className="grid"><aside className="card"><h3>行业分类</h3><div className="categories"><Link className={!category?"active":""} href={url("")}>全部招聘</Link>{categories.map(c=><Link key={c.id} className={category===c.id?"active":""} href={url(c.id)}>{c.name}</Link>)}</div></aside><section><div className="row"><h2>最新招聘</h2><span className="muted">共 {total} 条</span></div>{jobs.map(j=><Link className="card job" key={j.id} href={"/jobs/"+j.id}><div><h3>{j.title} {j.featured&&<span className="tag">精选</span>}</h3><div className="muted">{j.company} · {j.city} · {j.employment} · {j.category.name}</div><p>{j.summary.slice(0,130)}</p></div><div><div className="salary">{j.salary}</div><span className={"tag "+(j.priceFen?"paid":"")}>{j.priceFen?"¥"+formatPrice(j.priceFen)+" 解锁":"免费查看"}</span></div></Link>)}{!jobs.length&&<div className="card muted">暂时没有符合条件的招聘信息。</div>}<div className="row">{page>1&&<Link href={url(category,page-1)}>上一页</Link>}<span>第 {page} 页</span>{page*20<total&&<Link href={url(category,page+1)}>下一页</Link>}</div></section></div></>;
}