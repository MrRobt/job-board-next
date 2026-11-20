import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {price} from "@/lib/career/catalog";
import {refundInquiryEnabled} from "@/lib/payment/refund-query";
import {inquireRefundDispatch} from "@/app/actions/refund-finalization";

/** Read-only incident view. No action here can request merchant refunds. */
export default async function RefundDispatchLedger({searchParams}:{searchParams:Promise<{error?:string;result?:string}>}){
 await requireAdmin();
 const {error,result}=await searchParams;
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
  <p className="muted">本页面绝不发起或重发退款。只有商户查单开关及合法密钥已配置时，管理员才可触发验签查询；只有渠道确认退款成功，系统才会原子撤销未用权益。真实收款与退款出款默认关闭。</p>
  {result&&<p role="status">验签查单及账务结果：{result}。未知或处理中仍维持冻结。</p>}
  {error&&<p className="error" role="alert">查单或账务核验未完成；订单与权益不会被默认改变。请人工检查渠道/凭据/账本。</p>}
  <section className="card">
   <h2>总记录：{total}</h2>
   <p>{counts.map(c=>c.state+": "+c._count._all).join(" · ")||"暂无记录"}</p>
   <p className="muted">READY：尚未领取。IN_DOUBT：可能发送、也可能未发送，只能查询有签名验证的渠道状态；SUCCEEDED：商户确认成功且原子撤销权益。禁止根据超时自动重发或手动强制成功。</p>
  </section>
  <section className="card scroll"><table>
   <thead><tr><th>退款请求号</th><th>用户</th><th>渠道</th><th>金额</th><th>状态</th><th>领取时间（UTC）</th><th>关联订单 / 验签查询</th></tr></thead>
   <tbody>{items.map(item=><tr key={item.id}>
    <td>{item.outRefundNo}</td>
    <td>{item.intent.refundCase.user.email}</td>
    <td>{item.intent.order.provider}</td>
    <td>¥{price(item.intent.amountFen)}</td>
    <td>{item.state==="READY"?"待派发（未发款）":item.state==="SUCCEEDED"?"渠道确认退款成功，权益已撤销":"需核账（未知是否发款）"}</td>
    <td>{item.claimedAt?.toISOString()??"—"}</td>
    <td><Link href={"/admin/refunds/"+item.intent.orderId}>{item.intent.orderId}</Link>
     {item.state==="IN_DOUBT"&&refundInquiryEnabled(item.intent.order.provider==="WECHAT"?"WECHAT":"ALIPAY")&&
      <form action={inquireRefundDispatch.bind(null,item.id)}>
       <label><input type="checkbox" name="confirmed" value="yes" required/> 已获授权，执行渠道验签查单；不可重发退款</label>
       <button type="submit" className="quiet">查询并核对真实退款状态</button>
      </form>}
     {item.state==="IN_DOUBT"&&!refundInquiryEnabled(item.intent.order.provider==="WECHAT"?"WECHAT":"ALIPAY")&&
      <span className="muted">商户查单未启用</span>}
    </td>
   </tr>)}</tbody>
  </table>
  {!items.length&&<p>暂无派发记录。</p>}
  {total>items.length&&<p className="muted">只显示最早 50 条，请优先排查长期未核验的记录。</p>}
  </section>
  <Link href="/admin/tool-orders">返回工具订单</Link>
 </main>;
}
