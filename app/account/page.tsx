import Link from "next/link";
import {requireUser} from "@/lib/auth";
import {db} from "@/lib/db";
import {trial,available} from "@/lib/career/credits";
import {price,product} from "@/lib/career/catalog";
import {submitRefundCase} from "@/app/actions/refund-cases";

const statuses={PENDING:"待支付",PAID:"已支付",CLOSED:"已关闭",REFUNDED:"已退款"};
const refundLabels={OPEN:"待人工核查",PREPARED:"退款资料已准备（未发款）",REJECTED:"已答复",PROCESSING:"处理中",SUCCEEDED:"渠道已确认退款",FAILED:"处理失败"};
export default async function Account({searchParams}:{searchParams:Promise<{refundRequested?:string;refundError?:string}>}){
 const u=await requireUser();await trial(u.id);
 const {refundRequested,refundError}=await searchParams;
 const [credits,orders,runs,legacy]=await Promise.all([
  available(u.id),
  db.toolOrder.findMany({where:{userId:u.id},orderBy:{createdAt:"desc"},take:100,
   include:{refundCases:{orderBy:{createdAt:"desc"},take:1}}}),
  db.toolRun.findMany({where:{userId:u.id},orderBy:{createdAt:"desc"},take:50}),
  db.order.findMany({where:{userId:u.id},select:{id:true,amountFen:true,status:true,jobId:true,unlock:{select:{orderId:true}}},orderBy:{createdAt:"desc"},take:100})
 ]);
 return <>
  <section className="card top"><h1>我的账户</h1><p className="muted">{u.email}</p><h2>剩余 AI 次数：{credits}</h2><Link href="/pricing" className="button">查看次数包</Link></section>
  <section className="card"><h2>工具订单</h2>
   {refundRequested&&<p role="status">退款申请已提交，等待客服审核。尚未发生实际资金退款。</p>}
   {refundError&&<p className="error" role="alert">申请失败，请确认订单属于本人、已真实支付且未处于审核中，并填写至少 10 字说明。</p>}
   {orders.map(o=>{
    const last=o.refundCases[0];
    return <div className="card" key={o.id}>
     <div className="row"><strong>{product(o.sku)?.title??o.sku}</strong><span>{o.credits} 次 · ¥{price(o.amountFen)}</span><span>{statuses[o.status]}{o.provider==="MOCK"?"（模拟）":""}</span><Link href={"/tool-pay/"+o.id}>详情</Link></div>
     {last&&<p className="muted">售后申请：{refundLabels[last.status]}（申请不代表退款完成）</p>}
     {o.refundHold&&<p className="muted">该次数包因退款审核暂时冻结新的 AI 调用，免费试用及其他有效次数包不受影响。</p>}
     {o.status==="PAID"&&o.provider!=="MOCK"&&!o.refundHold&&<form className="form" action={submitRefundCase.bind(null,o.id)}>
      <label>申请售后/退款（10～500 字）<textarea name="reason" rows={2} required minLength={10} maxLength={500} placeholder="请描述服务问题和希望处理的方式，勿包含身份证、银行卡等敏感信息"/></label>
      <p className="muted">提交后本次数包暂停新增 AI 调用，等待人工审核，不会立即退款。已使用次数、服务质量争议及法律规定的权益均须人工核实。</p>
      <button type="submit" className="quiet">提交退款申请</button>
     </form>}
    </div>;
   })}
   {!orders.length&&<p className="muted">暂无工具订单。</p>}
  </section>
  <section className="card"><h2>最近调用记录</h2>
   {runs.map(r=><div className="row" key={r.id}><span>{r.kind}</span><span>{r.status==="SUCCEEDED"?"成功":r.status==="FAILED"?"失败返还":"处理中"}</span><span className="muted">{r.createdAt.toISOString().slice(0,16).replace("T"," ")} UTC</span></div>)}
   {!runs.length&&<p className="muted">暂无调用记录。</p>}
  </section>
  {legacy.length>0&&<section className="card"><h2>历史招聘订单售后</h2>
   {legacy.map(o=><div className="row" key={o.id}><span>¥{price(o.amountFen)} · {statuses[o.status]}</span><Link href={"/pay/"+o.id}>历史订单</Link>{o.status==="PAID"&&o.unlock&&<Link href={"/jobs/"+o.jobId}>已购信息</Link>}</div>)}
  </section>}
 </>;
}
