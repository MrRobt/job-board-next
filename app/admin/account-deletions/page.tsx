import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {listAccountDeletionReviewQueue} from "@/lib/account-deletion-review-queue";

const dispositions={
 EVIDENCE_UNAVAILABLE:"风险证据不足：禁止自动处理",
 FINANCIAL_HOLD:"财务留存与售后风险：暂停删除",
 OPERATIONAL_HOLD:"在途任务或未消费权益：暂停删除",
 MANUAL_REVIEW:"无已知高危账务，但仍需人工核查"
} as const;
const indicators:Record<string,string>={
 REALTOOLORDERS:"真实渠道工具订单",
 PENDINGTOOLORDERS:"待支付订单",
 LEGACYORDERS:"历史订单",
 REFUNDCASES:"退款或售后记录",
 REFUNDINTENTS:"退款意图",
 REFUNDDISPATCHES:"退款执行审计",
 RESERVEDRUNS:"在途 AI 预留",
 ACTIVEGRANTS:"未消费权益",
 APPLICATIONS:"个人求职记录",
 INCOMPLETE_RISK_EVIDENCE:"风险数据异常"
};

export default async function AccountDeletionReviewAdmin(){
 await requireAdmin();
 const rows=await listAccountDeletionReviewQueue(20);
 return <>
  <h1>账户注销人工审核队列（只读）</h1>
  <p><Link href="/admin">返回经营后台</Link></p>
  <p className="muted">仅显示最早 20 条等待人工审核的申请。此页面只读，不提供删除、资金退款、权益撤销、自动批准或修改审核状态的入口。无风险指标不代表可以注销：法定保存期、合同争议、消费者售后与个人信息处理均需人工确认。</p>
  <section className="card">
   <h2>当前显示 {rows.length} 条待人工审核申请</h2>
   {!rows.length?<p>当前没有待审核申请。</p>:<div className="scroll"><table>
    <thead><tr><th>申请时间（UTC）</th><th>申请人（脱敏）</th><th>状态</th><th>受限依据</th><th>风险预检</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.requestId}>
     <td>{row.requestedAt.toISOString()}</td>
     <td>{row.maskedEmail}</td>
     <td>{dispositions[row.assessment.disposition]}</td>
     <td>{row.assessment.reasons.length?row.assessment.reasons.map(r=>indicators[r]??"其他人工核查项").join("、"):"暂无可识别的自动风险指标"}</td>
     <td>真实订单 {row.exposure.realToolOrders}、历史订单 {row.exposure.legacyOrders}、退款记录 {row.exposure.refundCases}、在途 AI {row.exposure.reservedRuns}、剩余权益项 {row.exposure.activeGrants}；禁止自动删除</td>
    </tr>)}</tbody>
   </table></div>}
  </section>
  <p className="muted">队列状态只代表风险预检，不是法律意见、批准凭证或已完成个人信息删除。</p>
 </>;
}
