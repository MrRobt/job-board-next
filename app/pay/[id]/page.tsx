import Link from "next/link";
import {notFound} from "next/navigation";
import QRCode from "qrcode";
import {requireUser} from "@/lib/auth";
import {db} from "@/lib/db";
import {formatPrice} from "@/lib/jobs";
import {enabled} from "@/lib/payment/config";
import {createAlipayUrl} from "@/lib/payment/alipay";

export default async function Pay({params}:{params:Promise<{id:string}>}){const user=await requireUser();const {id}=await params;const order=await db.order.findFirst({where:{id,userId:user.id},include:{job:{select:{title:true,status:true,expiresAt:true}}}});if(!order)notFound();let ali="",qr="",error=false;
 if(order.status==="PENDING"&&order.paymentExpiresAt&&order.paymentExpiresAt>new Date()&&order.job.status==="PUBLISHED"&&(!order.job.expiresAt||order.job.expiresAt>new Date())){
 try{if(order.provider==="ALIPAY"&&enabled("ALIPAY"))ali=createAlipayUrl(order);if(order.provider==="WECHAT"&&enabled("WECHAT")&&order.codeUrl)qr=await QRCode.toDataURL(order.codeUrl,{width:260,margin:2});}catch{error=true;}
 }
 return <section className="card top"><h1>订单支付</h1><p>{order.job.title} · ¥{formatPrice(order.amountFen)}</p><p>状态：{order.status}</p>{ali&&<a className="button" href={ali} rel="noreferrer">前往支付宝</a>}{qr&&<><img src={qr} width={260} height={260} alt="微信扫码支付二维码"/><p>使用微信扫描二维码完成支付。</p></>}{error&&<p className="error">支付请求暂时失败，请勿重复支付，联系客服或稍后查询。</p>}{order.status==="PENDING"&&!ali&&!qr&&<p className="muted">当前没有可用的支付凭证。若已支付，请联系客服核实，请勿重复支付。</p>}<p>支付结果以服务端确认状态为准。</p><div className="row"><Link href={"/pay/"+id}>查询支付结果</Link><Link href="/account">我的订单</Link>{order.status==="PAID"&&<Link href={"/jobs/"+order.jobId}>查看招聘</Link>}</div></section>}