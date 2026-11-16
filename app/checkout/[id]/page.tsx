import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {getPublicJob,getJobDetails,formatPrice} from "@/lib/jobs";
import {mockPaymentEnabled} from "@/lib/payment/mock";
import {mockPurchase} from "@/app/actions/payment";
export default async function Checkout({params}:{params:Promise<{id:string}>}){const user=await requireUser();const {id}=await params;const job=await getPublicJob(id);if(!job)notFound();if(await getJobDetails(id,user.id))redirect("/jobs/"+id);return <section className="card top"><h1>解锁招聘信息</h1><p>{job.title} · ¥{formatPrice(job.priceFen)}</p><p className="muted">支付宝与微信真实支付尚未开放。</p>{mockPaymentEnabled()&&<form action={mockPurchase.bind(null,id)}><p>开发测试模式，不会真实扣款。</p><button>模拟支付并解锁</button></form>}<p><Link href={"/jobs/"+id}>返回详情</Link></p></section>}