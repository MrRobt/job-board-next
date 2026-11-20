import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {price} from "@/lib/career/catalog";

/** Read-only incident view. No action here can request merchant refunds. */
export default async function RefundDispatchLedger(){
 await requireAdmin();
 const [counts,items]=await Promise.all([
  db.toolRefundDispatch.groupBy({by:["state"],_count:{_all:true}}),
  db.toolRefundDispatch.findMany({
   orderBy:[{createdAt:"asc"},{id:"asc"}],take:50,
   include:{intent:{
    select:{orderId:true,amountFen:true,operatorId:true,approvedById:true,
      order:{select:{provider:true,status:true,refundHold:true}},
      refundCase:{select:{user:{select:{email:true}}}}}
   }}
  })
 ]);
 const total=counts.reduce((sum,r)=>sum+r._count._all,0);
 return <main>
  <h1>退款派发账本（只读）</h1>
  <p className="muted">此页面仅供管理员核查内部资金意图状态，不提供发款、重发或人工标记退款成功操作。真实收款与出款默认关闭。</p>
  <section className="card">
   <h2>总记录：{total}</h2>
   <p>{counts.map(c=>c.state+": "+c._count._all).join(" · ")||"暂无记录"}</p>
   <p className="muted">READY：尚未领取。IN_DOUBT：领取成功后资金请求可能发送，也可能未发送。必须查询有签名验证的商户结果，不得自动重试或据此修改用户余额。</p>
  </section>
  <section className="card scroll"><table>
   <thead><tr><th>退款请求号</th><th>用户</th><th>渠道</th><th>金额</th><th>状态</th><th>领取时间（UTC）</th><th>关联订单</th></tr></thead>
   <tbody>{items.map(item=><tr key={item.id}>
    <td>{item.outRefundNo}</td>
    <td>{item.intent.refundCase.user.email}</td>
    <td>{item.intent.order.provider}</td>
    <td>¥{price(item.intent.amountFen)}</td>
    <td>{item.state==="READY"?"待派发（未发款）":"需核账（未知是否发款）"}</td>
    <td>{item.claimedAt?.toISOString()??"—"}</td>
    <td><Link href={"/admin/refunds/"+item.intent.orderId}>{item.intent.orderId}</Link></td>
   </tr>)}</tbody>
  </table>
  {!items.length&&<p>暂无派发记录。</p>}
  {total>items.length&&<p className="muted">只显示最早 50 条，请优先排查长期未核验的记录。</p>}
  </section>
  <Link href="/admin/tool-orders">返回工具订单</Link>
 </main>;
}
