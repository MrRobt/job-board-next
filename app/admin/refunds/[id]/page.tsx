import Link from "next/link";
import {notFound} from "next/navigation";
import {requireAdmin} from "@/lib/auth";
import {inspectRefundPreflight} from "@/lib/career/refund-preflight-db";

const messages:Record<string,string>={
 NOT_PAID:"订单并非已付款状态",
 MOCK_PAYMENT:"模拟订单，不能以真实资金处理",
 NOT_FROZEN:"次数包没有冻结",
 NO_OPEN_REQUEST:"当前没有待处理的退款申请",
 MISSING_PAYMENT_REFERENCE:"缺少可核验的商户支付交易号",
 MISSING_GRANT:"该订单缺少次数包权益",
 IN_FLIGHT:"仍有正在处理的 AI 请求，需核对最终交付结果",
 CONSUMED_CREDITS:"已有成功消费的次数，须人工确认退款范围",
 LEDGER_MISMATCH:"次数账本不平衡，需要人工审计",
 PREVIOUS_REFUND_UNRESOLVED:"存在未处理完毕的历史退款",
 INVALID_ORDER_AMOUNT:"订单金额异常"
};
export default async function RefundPreflightPage({params}:{params:Promise<{id:string}>}){
 const admin=await requireAdmin();
 const {id}=await params;
 let report:Awaited<ReturnType<typeof inspectRefundPreflight>>;
 try{report=await inspectRefundPreflight(id,admin.id);}
 catch{notFound();}
 return <main>
  <h1>退款申请账务预检（只读）</h1>
  <p className="muted">此结果基于当前数据库快照，仅提示风险，不是资金退款授权；确认商户真实支付状态、消费者权益及人工审批后才可处理退款。</p>
  <section className="card">
   <p>订单：{report.orderId}</p>
   <p>渠道：{report.provider} · 订单状态：{report.orderStatus}</p>
   <p>退款审核冻结：{report.refundHold?"是":"否"} · 申请状态：{report.requestStatus??"无"}</p>
   <p>订单金额：{(report.amountFen/100).toFixed(2)} 元</p>
   <p>次数包：原 {report.totalCredits} 次 / 剩余 {report.remainingCredits} 次</p>
   <p>已完成：{report.succeededRuns} 次 · 在途：{report.reservedRuns} 次 · 失败返还：{report.failedRuns} 次</p>
   <h2>{report.review==="READY_FOR_MANUAL_REVIEW"?"可供人工进一步复核":"必须核对异常账务"}</h2>
   {report.issues.length>0?<ul>{report.issues.map(x=><li key={x}>{messages[x]??x}</li>)}</ul>:<p>当前自动检查未检出账本异常，仍需人工核验真实商户及法律条件。</p>}
   <p><strong>自动资金退款：不允许</strong></p>
  </section>
  <Link href="/admin/tool-orders">返回工具订单后台</Link>
 </main>;
}
