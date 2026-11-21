import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {db} from "@/lib/db";
import {submitDeadNotificationReview} from "@/app/actions/dead-notifications";
import {deadNotificationReviewGates} from "@/lib/career/ops-dead-review-web";

type RecordRow={idempotencyKey:string;kind:string;priority:string;attemptCount:number;failureCode:string|null;createdAt:Date;deadReview:{operatorId:string;reasonCode:string;reviewedAt:Date}|null};
const safeOutcome=(value:string|undefined)=>value==="REVIEWED"?"复核已记录":value==="ALREADY_REVIEWED"?"重复复核未产生新记录":value==="NOT_DEAD"?"任务已不处于终止状态":null;

/** Internal, default-disabled review UI; never unlocks or dispatches an intent. */
export default async function DeadNotificationsPage({searchParams}:{
 searchParams:Promise<{reviewError?:string;reviewOutcome?:string}>
}){
 await requireAdmin();
 const gates=deadNotificationReviewGates(process.env);
 if(!gates.canRead)return <main><h1>终止通知任务复核</h1><p>该运维功能尚未启用。</p><Link href="/admin">返回后台</Link></main>;
 const params=await searchParams;
 let records:RecordRow[];
 try{
  const client=db as unknown as {opsIncidentNotificationIntent:{findMany(args:{
   where:{state:"DEAD"};take:number;orderBy:{createdAt:"desc"};
   select:{idempotencyKey:true;kind:true;priority:true;attemptCount:true;failureCode:true;createdAt:true;deadReview:{select:{operatorId:true;reasonCode:true;reviewedAt:true}}}
  }):Promise<RecordRow[]>}};
  records=await client.opsIncidentNotificationIntent.findMany({
   where:{state:"DEAD"},take:25,orderBy:{createdAt:"desc"},
   select:{idempotencyKey:true,kind:true,priority:true,attemptCount:true,
    failureCode:true,createdAt:true,deadReview:{select:{operatorId:true,reasonCode:true,reviewedAt:true}}}
  });
 }catch{
  return <main><h1>终止通知任务复核</h1><p role="alert">审计数据库不可用或迁移未完成，不允许复核。</p></main>;
 }
 return <main><h1>终止通知任务复核</h1>
  <p className="muted">仅显示最近 25 条已终止任务，不含通知正文。复核只是记录人工核查，不代表已送达，也不会重新发送通知或改变任务状态。</p>
  {params.reviewError&&<p role="alert">复核未执行：请检查管理员权限、功能开关、来源、限流及任务状态。</p>}
  {safeOutcome(params.reviewOutcome)&&<p role="status">{safeOutcome(params.reviewOutcome)}</p>}
  <section className="card scroll"><table><thead><tr><th>任务标识</th><th>种类/级别</th><th>尝试</th><th>故障码</th><th>创建时间 UTC</th><th>人工复核</th></tr></thead>
   <tbody>{records.map(item=><tr key={item.idempotencyKey}>
    <td><code>{item.idempotencyKey.slice(0,12)}…</code></td>
    <td>{item.kind} / {item.priority}</td><td>{item.attemptCount}</td>
    <td>{item.failureCode??"未记录"}</td><td>{item.createdAt.toISOString()}</td>
    <td>{item.deadReview?<span>已复核（{item.deadReview.reasonCode}，{item.deadReview.reviewedAt.toISOString()}）</span>:
      gates.canReview?<form action={submitDeadNotificationReview}>
       <input type="hidden" name="key" value={item.idempotencyKey}/>
       <label>人工处理结果<select name="reasonCode" required defaultValue="REVIEWED_NO_REQUEUE">
        <option value="REVIEWED_NO_REQUEUE">已审核，不重新发送</option>
        <option value="NEEDS_OFFLINE_INVESTIGATION">需要线下调查</option>
       </select></label>
       <label><input type="checkbox" name="confirmed" value="yes" required/> 我确认仅记录复核，不发出通知</label>
       <button type="submit" className="quiet">记录复核</button>
      </form>:"待人工复核（只读）"}</td>
   </tr>)}</tbody></table>
   {!records.length&&<p>暂无终止任务。此页面不会创建、恢复或发送任务。</p>}
  </section><Link href="/admin">返回管理后台</Link>
 </main>;
}
