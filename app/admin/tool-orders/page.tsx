import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {price} from "@/lib/career/catalog";
import {staleCreditReservations} from "@/lib/career/audit";
import {confirmCreditRefund} from "@/app/actions/credit-audit";
import {reconcilePayment} from "@/app/actions/payment-reconciliation";
import {reconciliationEnabled} from "@/lib/career/payment-reconciliation";
import {rejectRefundCase,prepareRefundCase} from "@/app/actions/refund-cases";
import {approveRefundAction} from "@/app/actions/refund-approvals";

export default async function ToolOrders({searchParams}:{searchParams:Promise<{error?:string;ok?:string;paymentError?:string;paymentResult?:string;refundError?:string;refundRejected?:string;refundPrepared?:string;refundPrepareError?:string;refundApproved?:string;refundApprovalError?:string}>}){
 await requireAdmin();
 const {error,ok,paymentError,paymentResult,refundError,refundRejected,refundPrepared,refundPrepareError,refundApproved,refundApprovalError}=await searchParams;
 const [orders,paid,runs,stale,pendingOrders,openRefundCases,preparedIntents]=await Promise.all([
  db.toolOrder.findMany({
   orderBy:{createdAt:"desc"},take:100,
   include:{user:{select:{email:true}},grant:{select:{remaining:true}}}
  }),
  db.toolOrder.aggregate({where:{status:"PAID",provider:{not:"MOCK"}},_sum:{amountFen:true}}),
  db.toolRun.groupBy({by:["status"],_count:{_all:true}}),
  staleCreditReservations(),
  db.toolOrder.findMany({where:{status:"PENDING",provider:{in:["ALIPAY","WECHAT"]}},orderBy:{createdAt:"asc"},take:30}),
  db.toolRefundCase.findMany({where:{status:"OPEN"},orderBy:{createdAt:"asc"},take:30,include:{user:{select:{email:true}},order:{select:{sku:true,grant:{select:{total:true,remaining:true}}}}}}),
  db.toolRefundIntent.findMany({orderBy:{createdAt:"desc"},take:30,include:{order:{select:{status:true,refundHold:true}},refundCase:{select:{user:{select:{email:true}}}}}})
 ]);
 return <>
  <h1>AI 工具经营概览</h1>
  {ok&&<p role="status">人工核查记录已提交，单次预留次数已返还。</p>}
  {error&&<p className="error" role="alert">核查操作未完成：请确认异常超过十分钟、填写依据并勾选确认；若已处理请刷新。</p>}
  {paymentResult&&<p role="status">商户对账结果：{paymentResult}。以渠道验签结果和订单最终状态为准。</p>}
  {paymentError&&<p className="error" role="alert">商户对账未完成。请核查渠道配置、订单状态或外部服务，订单不会被默认关闭。</p>}
  {refundRejected&&<p role="status">退款申请已作出审核答复，该次数包恢复可用；没有发生资金退款。</p>}
  {refundPrepared&&<p role="status">退款意图已持久化准备，等待独立商户/合规审批；未发起资金退款。</p>}
  {refundPrepareError&&<p className="error" role="alert">无法准备退款：请检查无在途、无已消费、账本正常、请求尚未准备及审核说明。</p>}
  {refundApproved&&<p role="status">第二名管理员已完成内部审批，资金尚未发起退款。</p>}
  {refundApprovalError&&<p className="error" role="alert">双人审核失败：准备人与审批人不得相同；订单冻结、金额、次数和审核记录必须完整有效。</p>}
  {refundError&&<p className="error" role="alert">退款审核未完成，请确认申请仍处于待核查状态，填写不少于 10 字依据。</p>}
  <section className="card">
   <h2>真实支付累计（未扣除成本） ¥{price(paid._sum.amountFen??0)}</h2>
   <p>{runs.map(r=>r.status+" "+r._count._all).join(" · ")||"暂无调用"}</p>
  </section>
  <section className="card">
   <h2>待核查退款申请：{openRefundCases.length}</h2>
   <p className="muted">申请提交仅冻结次数包新增调用，不代表资金已退。请核对交易、已消费次数、服务争议及消费者权益法规。未完成支付渠道退款接口联调前，本后台不能标记实际退款成功。</p>
   {openRefundCases.length===0?<p>暂无待审核申请。</p>:<div className="scroll"><table><thead>
    <tr><th>申请</th><th>用户</th><th>订单 / 次数</th><th>申请理由</th><th>处理</th></tr>
   </thead><tbody>{openRefundCases.map(c=><tr key={c.id}>
    <td>{c.createdAt.toISOString()}</td><td>{c.user.email}</td>
    <td>{c.order.sku} / {c.order.grant?.remaining??"—"} 剩余，原 {c.order.grant?.total??"—"} 次</td>
    <td>{c.reason}<p><Link href={"/admin/refunds/"+c.orderId}>查看只读账务预检</Link></p></td>
    <td><form action={rejectRefundCase.bind(null,c.id)}>
     <label>审核说明<input name="reason" minLength={10} maxLength={500} required/></label>
     <label><input type="checkbox" name="confirmed" value="yes" required/> 已核对情况，同意驳回并解冻本次数包</label>
     <button type="submit" className="quiet">驳回申请并解冻</button>
    </form>
    <form action={prepareRefundCase.bind(null,c.id)}>
      <label>内部预备退款依据（不发款，10–80 字）<input name="reason" minLength={10} maxLength={80} required/></label>
      <label><input type="checkbox" name="confirmed" value="yes" required/> 已核查未消费、无在途请求；仅准备退款记录，不调用商户</label>
      <button type="submit" className="quiet">仅准备退款意图</button>
    </form></td>
   </tr>)}</tbody></table></div>}
  </section>
  <section className="card">
   <h2>已准备的退款意图：{preparedIntents.length} 条（仅显示最近 30 条）</h2>
   <p className="muted">此处为内部准备记录，未向支付宝或微信申请退款。记录的退款请求号和指纹不可更改，必须经过独立商户审批、渠道执行/查询与资金权益核对。</p>
   {preparedIntents.length===0?<p>暂无已准备的退款记录。</p>:<div className="scroll"><table>
     <thead><tr><th>退款请求号</th><th>用户</th><th>金额</th><th>订单</th><th>状态</th><th>核查</th></tr></thead>
     <tbody>{preparedIntents.map(p=><tr key={p.id}>
       <td>{p.outRefundNo}</td><td>{p.refundCase.user.email}</td>
       <td>¥{price(p.amountFen)}</td><td>{p.orderId}</td>
       <td>{p.state==="APPROVED"?"双人内部审批通过":p.state==="PREPARED"?"待另一名管理员审批":p.state} · 未发款 · 权益{p.order.refundHold?"冻结":"异常未冻结"}</td>
       <td><Link href={"/admin/refunds/"+p.orderId}>查看账务</Link>
       {p.state==="PREPARED"&&<form action={approveRefundAction.bind(null,p.id)}>
        <label>独立审批依据（10–500字）<input name="reason" minLength={10} maxLength={500} required/></label>
        <label><input name="confirmed" value="yes" type="checkbox" required/> 我不是退款准备人，已二次核验账本，仅内部审批，不发款</label>
        <button type="submit" className="quiet">双人内部审批</button>
       </form>}</td>
     </tr>)}</tbody>
   </table></div>}
  </section>
  <section className="card">
   <h2>待支付订单查询与安全关单</h2>
   <p className="muted">仅管理员操作。正式渠道对账必须在具备合法商户凭据、显式开启 ENABLE_PAYMENT_RECONCILIATION 后使用。先查单；订单超过支付截止时间、渠道确认仍未支付时，才允许请求关单，并再次查询确认已关闭后释放订单占用。</p>
   {pendingOrders.length===0?<p>暂无待支付订单。</p>:<div className="scroll"><table>
    <thead><tr><th>订单</th><th>渠道</th><th>支付期限 UTC</th><th>商户状态操作</th></tr></thead>
    <tbody>{pendingOrders.map(o=>{
     const enabled=reconciliationEnabled(o.provider==="WECHAT"?"WECHAT":"ALIPAY");
     const expired=!!o.paymentExpiresAt&&o.paymentExpiresAt<=new Date();
     return <tr key={o.id}><td>{o.id}</td><td>{o.provider}</td>
      <td>{o.paymentExpiresAt?.toISOString()??"未设置"}</td>
      <td><form action={reconcilePayment.bind(null,o.id)}>
       <button type="submit" name="action" value="CHECK" disabled={!enabled}>向商户查单</button>
       {expired&&<><label><input type="checkbox" name="confirmed" value="yes"/> 已核实订单到期，授权向渠道关单</label>
       <button type="submit" name="action" value="CLOSE_EXPIRED" disabled={!enabled}>确认渠道关单并更新</button></>}
       {!enabled&&<span className="muted">商户对账未启用</span>}
      </form></td></tr>;
    })}</tbody>
   </table></div>}
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
