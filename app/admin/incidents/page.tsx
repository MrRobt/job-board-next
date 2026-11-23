import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {confirmOpsIncident} from "@/app/actions/ops-incidents";
import {incidentPanelSelect,toOpsIncidentView,type OpsIncidentPanelRecord} from "@/lib/career/ops-incident-view";
import {opsIncidentGates} from "@/lib/career/ops-incident-gates";
import {opsIncidentOutcomeNotice} from "@/lib/career/ops-incident-notice";
import {countRefundLedgerReviewHolds} from "@/lib/career/refund-review-ops-read";

/** Manual admin-only operations review. Never writes to a financial ledger. */
export default async function OpsIncidentAdmin({
 searchParams
}:{searchParams:Promise<{incidentError?:string;incidentOutcome?:string}>}){
 await requireAdmin();
 const params=await searchParams;
 const gates=opsIncidentGates(process.env);
 if(!gates.canRead)
  return <main><h1>运行事故与告警</h1>
   <p className="muted">人工事故确认尚未启用。须先核实目标数据库迁移、权限和审计门禁。</p>
   <Link href="/admin">返回管理概览</Link></main>;
 let records:OpsIncidentPanelRecord[];
 let reviewCount:number;
 try{
  const client=db as unknown as {opsAlertIncident:{
   findMany(args:{
    orderBy:{lastSeenAt:"desc"};take:number;
    select:typeof incidentPanelSelect
   }):Promise<OpsIncidentPanelRecord[]>
  }};
  records=await client.opsAlertIncident.findMany({
   orderBy:{lastSeenAt:"desc"},take:25,
   select:incidentPanelSelect
  });
  // A failed or invalid aggregate must fail closed instead of displaying a false zero.
  reviewCount=await countRefundLedgerReviewHolds(db);
 }catch{
  return <main><h1>运行事故与告警</h1>
   <p role="alert">事故账本不可用。请检查独立环境数据库迁移和服务日志；未执行任何确认操作。</p>
   <Link href="/admin">返回管理概览</Link></main>;
 }
 let items:ReturnType<typeof toOpsIncidentView>[];
 try{items=records.map(toOpsIncidentView)}
 catch{return <main><h1>运行事故与告警</h1><p role="alert">事故数据校验失败，请人工检查。</p></main>}
 return <main><h1>运行事故与告警</h1>
  <p className="muted">仅展示最近 25 条事故汇总；不会显示用户简历、商户密钥或审核人笔记。确认仅表示管理员已接手排查，不代表退款成功、AI 调用已修复或外部通知已送达。</p>
  {params.incidentError&&<p role="alert">事故确认未执行或失败，请检查权限、操作限流及事故是否已更新。</p>}
  {opsIncidentOutcomeNotice(params.incidentOutcome)&&<p role="status">{opsIncidentOutcomeNotice(params.incidentOutcome)}</p>}
  {reviewCount>0&&<section className="card" role="alert">
   <h2>当前退款已验签成功但本地权益无法结算：{reviewCount} 条需人工核账</h2>
   <p>只计仍处于 IN_DOUBT 的退款异常，成功结算后活跃数自动消失，但历史审计仍保留；并非商户回款证明。本提示不会自动创建、确认或解决事故，也不重发退款或改变权益。</p>
   <Link href="/admin/refund-dispatch">查看退款派发账本并人工核账</Link>
  </section>}
  <section className="card scroll"><table>
   <thead><tr><th>类别</th><th>优先级</th><th>状态</th><th>数量</th><th>发生时间 UTC</th><th>最近发现 UTC</th><th>人工确认</th></tr></thead>
   <tbody>{items.map(item=><tr key={item.key}>
    <td>{item.label}</td><td>{item.priority}</td><td>{item.state}</td>
    <td>{item.count}</td><td>{item.openedAt.toISOString()}</td>
    <td>{item.lastSeenAt.toISOString()}</td>
    <td>{item.state==="OPEN"&&gates.canAcknowledge?
     <form action={confirmOpsIncident}>
      <input type="hidden" name="key" value={item.key}/>
      <input type="hidden" name="expectedOpenedAt" value={item.openedAt.toISOString()}/>
      <label>核实记录（10–500 字）<textarea name="reason" minLength={10} maxLength={500} required rows={3} placeholder="记录实际核对工作，不包含用户敏感信息"/></label>
      <label><input type="checkbox" name="confirmed" value="yes" required/> 已人工核实并愿意接手跟进；此操作不处理资金或自动通知</label>
      <button type="submit" className="quiet">确认接手事故</button>
     </form>:item.state==="OPEN"?"待人工处理（只读模式）":item.state==="ACKNOWLEDGED"?"已记录人工确认":"已解决"}
    </td>
   </tr>)}</tbody>
  </table>
  {!items.length&&<p>尚无持久化运行事故。此页面不自动扫描或创建事故。</p>}
  </section><Link href="/admin">返回管理概览</Link>
 </main>;
}
