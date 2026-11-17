import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {price} from "@/lib/career/catalog";
import {staleCreditReservations} from "@/lib/career/audit";
import {confirmCreditRefund} from "@/app/actions/credit-audit";

export default async function ToolOrders({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
 await requireAdmin();
 const {error,ok}=await searchParams;
 const [orders,paid,runs,stale]=await Promise.all([
  db.toolOrder.findMany({
   orderBy:{createdAt:"desc"},take:100,
   include:{user:{select:{email:true}},grant:{select:{remaining:true}}}
  }),
  db.toolOrder.aggregate({where:{status:"PAID",provider:{not:"MOCK"}},_sum:{amountFen:true}}),
  db.toolRun.groupBy({by:["status"],_count:{_all:true}}),
  staleCreditReservations()
 ]);
 return <>
  <h1>AI 工具经营概览</h1>
  {ok&&<p role="status">人工核查记录已提交，单次预留次数已返还。</p>}
  {error&&<p className="error" role="alert">核查操作未完成：请确认异常超过十分钟、填写依据并勾选确认；若已处理请刷新。</p>}
  <section className="card">
   <h2>真实支付累计（未扣除成本） ¥{price(paid._sum.amountFen??0)}</h2>
   <p>{runs.map(r=>r.status+" "+r._count._all).join(" · ")||"暂无调用"}</p>
  </section>
  <section className="card">
   <h2>异常预留次数（超过 10 分钟）：{stale.count}</h2>
   <p className="muted">模型已完成但网络中断、进程崩溃都可能导致次数长时间预留。先核对模型服务和用户实际交付情况，确认用户未收到有效服务后才能人工返还。不自动重试或退款。</p>
   {stale.rows.length>0&&<div className="scroll"><table>
    <thead><tr><th>运行 ID</th><th>用户</th><th>类型</th><th>预留时间（UTC）</th><th>权益来源</th><th>核查操作</th></tr></thead>
    <tbody>{stale.rows.map(r=><tr key={r.id}>
     <td>{r.id}</td><td>{r.user.email}</td><td>{r.kind}</td><td>{r.createdAt.toISOString()}</td>
     <td>{r.grant.orderId?"付费订单":"免费试用"}</td>
     <td><form action={confirmCreditRefund.bind(null,r.id)}>
      <label>核查依据（不少于 10 字，勿填敏感信息）<input name="reason" required minLength={10} maxLength={500}/></label>
      <label><input type="checkbox" name="confirmed" value="yes" required/> 已核查用户未收到有效 AI 服务，同意返还一次</label>
      <button type="submit">人工返还 1 次</button>
     </form></td>
    </tr>)}</tbody>
   </table></div>}
   {stale.count>stale.rows.length&&<p className="muted">仅显示最早的 50 条，仍有 {stale.count-stale.rows.length} 条待核查。</p>}
  </section>
  <section className="card scroll"><table>
   <thead><tr>{["订单","用户","商品","金额","支付状态","剩余次数"].map(x=><th key={x}>{x}</th>)}</tr></thead>
   <tbody>{orders.map(o=><tr key={o.id}><td>{o.id}</td><td>{o.user.email}</td><td>{o.sku}</td><td>¥{price(o.amountFen)}</td><td>{o.provider} · {o.status}</td><td>{o.grant?.remaining??"—"}</td></tr>)}</tbody>
  </table></section>
  <p className="muted">只读支付订单查询，不提供人工改为已支付。AI 预留返还另有管理员核查审计；商户退款和资金对账接口待验收。</p>
 </>;
}
