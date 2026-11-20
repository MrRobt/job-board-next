import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {price} from "@/lib/career/catalog";
import {refundInquiryEnabled} from "@/lib/payment/refund-query";
import {refundSubmissionEnabled} from "@/lib/payment/refund-submit";
import {submitAuthorizedRefund} from "@/app/actions/refund-submission";
import {inquireRefundDispatch} from "@/app/actions/refund-finalization";

/** Merchant send action appears only behind explicit runtime/merchant gates. */
export default async function RefundDispatchLedger({searchParams}:{searchParams:Promise<{error?:string;result?:string;sendError?:string;sendUncertain?:string;sendResult?:string}>}){
 await requireAdmin();
 const {error,result,sendError,sendUncertain,sendResult}=await searchParams;
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
  <h1>退款派发账本</h1>
  <p className="muted">真实退款发送默认关闭。仅在合法商户凭据、财务人工审批和独立发送开关均满足时，管理员才可首次发送；需要再次输入完整退款单号确认。发送一经领取便永久进入 IN_DOUBT，超时不能重发，只能渠道验签查单。</p>
  {result&&<p role="status">验签查单及账务结果：{result}。未知或处理中仍维持冻结。</p>}
  {error&&<p className="error" role="alert">查单或账务核验未完成；订单与权益不会被默认改变。请人工检查渠道/凭据/账本。</p>}
  {sendError&&<p className="error" role="alert">退款发送未获授权：检查独立开关、工单状态、退款号确认及操作限流。</p>}
  {sendUncertain&&<p className="error" role="alert">退款请求结果不明。即使超时也可能已经发送，禁止重发；请等待并使用商户验签查询核实。</p>}
  {sendResult&&<p role="status">已尝试唯一一次退款发送，当前状态：{sendResult}。不是资金已退证明，必须独立查单。</p>}
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
     {item.state==="READY"&&(item.intent.order.provider==="WECHAT"||item.intent.order.provider==="ALIPAY")&&refundSubmissionEnabled(item.intent.order.provider)&&
      <form action={submitAuthorizedRefund.bind(null,item.id)}>
       <label>再次输入退款请求号确认（不可撤回）<input name="outRefundNo" required autoComplete="off" placeholder="完整退款请求号"/></label>
       <label><input type="checkbox" name="confirmed" value="yes" required/> 已有合法商户及双人独立审批授权；仅允许发送一次、结果未知不重发</label>
       <button type="submit" className="quiet">确认唯一一次渠道退款请求</button>
      </form>}
     {item.state==="READY"&&(item.intent.order.provider==="WECHAT"||item.intent.order.provider==="ALIPAY")&&!refundSubmissionEnabled(item.intent.order.provider)&&<span className="muted">真实退款发送未开启</span>}
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
