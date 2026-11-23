import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {listAccountDeletionReviewQueue} from "@/lib/account-deletion-review-queue";
import {reviewGates} from "@/lib/account-deletion-review-event-policy";
import {submitAccountDeletionReview} from "@/app/actions/account-deletion-review";

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

export default async function AccountDeletionReviewAdmin({searchParams}:{searchParams:Promise<{reviewError?:string;reviewOutcome?:string}>}){
 await requireAdmin();
 const {reviewError,reviewOutcome}=await searchParams;
 const canRecord=reviewGates(process.env).canRecord;
 const rows=await listAccountDeletionReviewQueue(20);
 return <>
  <h1>账户注销人工审核队列</h1>
  <p><Link href="/admin">返回经营后台</Link></p>
  <p className="muted">仅显示最早 20 条等待人工审核的申请。风险预检只读；经独立授权后可追加固定原因的审核事件，但不提供删除、退款、撤权、批准或修改注销状态的入口。无风险指标不代表可以注销：法定保存期、合同争议、消费者售后与个人信息处理均需人工确认。</p>
  {reviewError&&<p className="error" role="alert">未能记录审核事件，可能是审批记录权限未启用、参数无效或次数受限。</p>}
  {reviewOutcome==="RECORDED"&&<p role="status">已记录人工审核事项；未执行账户注销或资金变更。</p>}
  {reviewOutcome==="ALREADY_RECORDED"&&<p role="status">该申请的同类事项已有审核记录；未重复写入。</p>}
  <section className="card">
   <h2>当前显示 {rows.length} 条待人工审核申请</h2>
   {!rows.length?<p>当前没有待审核申请。</p>:<div className="scroll"><table>
    <thead><tr><th>申请时间（UTC）</th><th>申请人（脱敏）</th><th>状态</th><th>受限依据</th><th>风险预检</th><th>人工审核事件（只记录、不批准）</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.requestId}>
     <td>{row.requestedAt.toISOString()}</td>
     <td>{row.maskedEmail}</td>
     <td>{dispositions[row.assessment.disposition]}</td>
     <td>{row.assessment.reasons.length?row.assessment.reasons.map(r=>indicators[r]??"其他人工核查项").join("、"):"暂无可识别的自动风险指标"}</td>
     <td>真实订单 {row.exposure.realToolOrders}、历史订单 {row.exposure.legacyOrders}、退款记录 {row.exposure.refundCases}、在途 AI {row.exposure.reservedRuns}、剩余权益项 {row.exposure.activeGrants}；禁止自动删除</td>
     <td>
      {row.reviewEvents.length?<ul>{row.reviewEvents.map(event=><li key={event.reasonCode}>{event.reasonCode} · {event.recordedAt.toISOString()}</li>)}</ul>:<p>暂无审核事件</p>}
      {canRecord?<form action={submitAccountDeletionReview}>
       <input type="hidden" name="requestId" value={row.requestId}/>
       <label>人工核查原因
        <select name="reasonCode" required defaultValue="NEEDS_PRIVACY_REVIEW">
         <option value="NEEDS_PRIVACY_REVIEW">需个人信息与合规复核</option>
         <option value="FINANCIAL_HOLD_RECORDED">已记录资金/售后保留风险</option>
         <option value="NEEDS_OFFLINE_VERIFICATION">需要线下身份及资料核验</option>
        </select>
       </label>
       <label><input type="checkbox" name="confirmed" value="yes" required/>我确认只追加审核事件，不批准删除账户或修改财务数据</label>
       <button type="submit">记录审核事项</button>
      </form>:<p className="muted">人工审核写入未启用；仅可阅读现有记录。</p>}
     </td>
    </tr>)}</tbody>
   </table></div>}
  </section>
  <p className="muted">队列状态只代表风险预检，不是法律意见、批准凭证或已完成个人信息删除。</p>
 </>;
}
