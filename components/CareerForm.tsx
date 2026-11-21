"use client";
import {useActionState,useState} from "react";
import {practice,type PracticeState} from "@/app/actions/career";
import {titles,type Kind} from "@/lib/career/contracts";
import {
 appendInterviewRound,canStartInterviewRound,MAX_INTERVIEW_ROUNDS,
 type InterviewRound
} from "@/lib/career/interview-rounds";

type Props={
 tool:"resume"|"interview";
 live?:boolean;
 provider?:string;
 privacy?:string;
 credits?:number;
 requestId?:string;
};
export default function CareerForm({tool,live=false,provider="",privacy="",credits=0,requestId=""}:Props){
 const [kind,setKind]=useState<Kind>(tool==="resume"?"resume":"questions");
 const [id,setId]=useState(requestId);
 const [role,setRole]=useState("");
 const [context,setContext]=useState("");
 const [text,setText]=useState("");
 const [consent,setConsent]=useState(false);
 const [rounds,setRounds]=useState<InterviewRound[]>([]);
 const [lastResultKind,setLastResultKind]=useState<Kind|null>(null);

 const [state,action,pending]=useActionState(async(previous:PracticeState,form:FormData)=>{
  const result=await practice(previous,form);
  // Every call, including a failed one, must use a new idempotency token.
  setId(crypto.randomUUID());
  if(result.report&&result.mode){
   const submittedKind=form.get("kind");
   setLastResultKind(
    submittedKind==="feedback"?"feedback":submittedKind==="questions"?"questions":"resume"
   );
   if(tool==="interview"&&submittedKind==="feedback"){
    const question=String(form.get("context")??"");
    const {report,mode}=result;
    setRounds(previousRounds=>
     canStartInterviewRound(previousRounds.length)
      ?appendInterviewRound(previousRounds,{question,summary:report.summary,mode})
      :previousRounds
    );
   }
  }
  return result;
 },{} as PracticeState);

 const selectableQuestions=tool==="interview"&&lastResultKind==="questions"&&state.report
  ?state.report.sections.flatMap(section=>section.items).filter(q=>q.length>=5&&q.length<=5000).slice(0,8)
  :[];
 const roundLimit=tool==="interview"&&!canStartInterviewRound(rounds.length);
 const chooseQuestion=(question:string)=>{
  setKind("feedback");
  setContext(question);
  setText("");
  setLastResultKind(null);
 };
 const nextRound=()=>{
  setKind("questions");
  setContext("");
  setText("");
  setLastResultKind(null);
 };
 return <>
  {tool==="interview"&&<section className="card" aria-label="本地多轮练习进度">
   <h2>逐轮模拟面试</h2>
   <p className="muted">本页最多 {MAX_INTERVIEW_ROUNDS} 轮，已完成 {rounds.length} 轮。每轮可先选题、回答、查看反馈，再继续下一轮。</p>
   <p className="muted">进度仅在当前页面内存中保留问题和反馈摘要，<strong>不保存完整回答</strong>；刷新或关闭页面会清空进度。AI 模式每次提交仍单独计费、单独确认数据处理。</p>
   {rounds.map((round,i)=><details key={i}>
    <summary>第 {i+1} 轮 · {round.mode==="ai"?"AI 反馈":"规则示例"}</summary>
    <p className="content">{round.question}</p>
    <p className="muted">{round.summary}</p>
   </details>)}
   {roundLimit&&<p role="status">已完成本页 {MAX_INTERVIEW_ROUNDS} 轮。可自行保存反馈后清空进度，重新练习。</p>}
   {rounds.length>0&&<button type="button" className="quiet" disabled={pending} onClick={()=>{
    setRounds([]);
    nextRound();
   }}>清空本页练习进度</button>}
  </section>}
  <form action={action} className="card form">
   <input type="hidden" name="kind" value={kind}/>
   <input type="hidden" name="requestId" value={id}/>
   {tool==="interview"&&<>
    <label htmlFor="kind">练习方式</label>
    <select id="kind" value={kind} onChange={e=>{
     setKind(e.target.value==="feedback"?"feedback":"questions");
     setContext("");
     setText("");
     setLastResultKind(null);
    }} disabled={pending}>
     <option value="questions">生成练习题</option>
     <option value="feedback">回答反馈</option>
    </select>
   </>}
   <label htmlFor="role">目标岗位</label>
   <input id="role" name="role" required minLength={2} maxLength={120}
    placeholder="例如：Go 后端开发" value={role} onChange={e=>{
     setRole(e.target.value);
     if(tool==="interview"){setRounds([]);setLastResultKind(null);}
    }}/>
   <label htmlFor="context">{kind==="feedback"?"面试问题":"目标岗位要求（可选）"}</label>
   <textarea id="context" name="context" rows={4} maxLength={5000}
    required={kind==="feedback"} value={context} onChange={e=>setContext(e.target.value)}/>
   {kind==="questions"
    ?<input type="hidden" name="text" value=""/>
    :<>
     <label htmlFor="text">{kind==="resume"?"脱敏简历":"真实练习回答"}</label>
     <textarea id="text" name="text" required minLength={20} maxLength={8000}
      rows={9} value={text} onChange={e=>setText(e.target.value)}/>
    </>}
   <p className="muted">删除姓名、电话、邮箱、身份证、住址、第三方隐私及商业秘密。平台不保存此表单文本及报告。</p>
   {live&&<>
    <label className="consent">
     <input type="checkbox" name="consent" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
     我已阅读 <a href={privacy} target="_blank" rel="noreferrer">{provider} 数据处理说明</a>，同意本次提交脱敏文本给该模型。
    </label>
    <p>剩余 AI 次数：{state.remaining??credits}</p>
   </>}
   <div className="actions">
    <button name="mode" value="sample" className="quiet" disabled={pending||roundLimit}>
     {pending?"处理中…":"免费规则示例"}
    </button>
    {live&&<button name="mode" value="ai" disabled={pending||!consent||roundLimit}>
     AI {titles[kind]}（1 次）
    </button>}
   </div>
   {!live&&<p className="muted">真实 AI 尚未开放；规则示例不调用模型、不扣费。</p>}
   {state.error&&<p role="alert" className="error">{state.error}</p>}
  </form>
  {state.report&&<section aria-live="polite" className="card">
   <span className="tag">{state.mode==="ai"?"AI 生成 · 请核实":"规则示例 · 非 AI"}</span>
   <h2>练习报告</h2>
   <p className="content">{state.report.summary}</p>
   {state.report.sections.map((section,i)=><div className="result" key={i}>
    <h3>{section.title}</h3>
    <ul>{section.items.map((item,j)=><li key={j}>{item}</li>)}</ul>
   </div>)}
   <h3>下一步</h3>
   <ol>{state.report.next.map((item,i)=><li key={i}>{item}</li>)}</ol>
   {tool==="interview"&&lastResultKind==="questions"&&!roundLimit&&
    <div className="result">
     <h3>选择一道题，开始第 {rounds.length+1} 轮</h3>
     <p className="muted">选题后填写自己的真实回答；该操作不会自动调用 AI。</p>
     {selectableQuestions.map((q,i)=><button type="button" className="quiet"
      key={i} disabled={pending} onClick={()=>chooseQuestion(q)}>
      第 {i+1} 题：{q.length>100?q.slice(0,100)+"…":q}
     </button>)}
    </div>}
   {tool==="interview"&&lastResultKind==="feedback"&&!roundLimit&&
    <button type="button" className="quiet" disabled={pending} onClick={nextRound}>
     继续下一轮（重新选题）
    </button>}
   <p className="muted">仅供个人练习，非录用判断；可自行复制保存。</p>
  </section>}
 </>;
}
