"use client";
import {useActionState,useState} from "react";
import {practice,type PracticeState} from "@/app/actions/career";
import {titles,type Kind} from "@/lib/career/contracts";
export default function CareerForm({tool,live=false,provider="",privacy="",credits=0,requestId=""}:{tool:"resume"|"interview";live?:boolean;provider?:string;privacy?:string;credits?:number;requestId?:string}){
 const [kind,setKind]=useState<Kind>(tool==="resume"?"resume":"questions");
 const [id,setId]=useState(requestId);
 const [state,action,pending]=useActionState(async(prev:PracticeState,form:FormData)=>{const result=await practice(prev,form);setId(crypto.randomUUID());return result;},{} as PracticeState);
 const [role,setRole]=useState("");const [context,setContext]=useState("");const [text,setText]=useState("");const [consent,setConsent]=useState(false);
 return <><form action={action} className="card form"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="requestId" value={id}/>
 {tool==="interview"&&<><label htmlFor="kind">练习方式</label><select id="kind" value={kind} onChange={e=>{setKind(e.target.value==="feedback"?"feedback":"questions");setContext("");setText("");}} disabled={pending}><option value="questions">生成练习题</option><option value="feedback">回答反馈</option></select></>}
 <label htmlFor="role">目标岗位</label><input id="role" name="role" required minLength={2} maxLength={120} placeholder="例如：Go 后端开发" value={role} onChange={e=>setRole(e.target.value)}/>
 <label htmlFor="context">{kind==="feedback"?"面试问题":"目标岗位要求（可选）"}</label><textarea id="context" name="context" rows={4} maxLength={5000} required={kind==="feedback"} value={context} onChange={e=>setContext(e.target.value)}/>
 {kind==="questions"?<input type="hidden" name="text" value=""/>:<><label htmlFor="text">{kind==="resume"?"脱敏简历":"真实练习回答"}</label><textarea id="text" name="text" required minLength={20} maxLength={8000} rows={9} value={text} onChange={e=>setText(e.target.value)}/></>}
 <p className="muted">删除姓名、电话、邮箱、身份证、住址、第三方隐私及商业秘密。平台不保存此表单文本及报告。</p>
 {live&&<><label className="consent"><input type="checkbox" name="consent" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 我已阅读 <a href={privacy} target="_blank" rel="noreferrer">{provider} 数据处理说明</a>，同意本次提交脱敏文本给该模型。</label><p>剩余 AI 次数：{state.remaining??credits}</p></>}
 <div className="actions"><button name="mode" value="sample" className="quiet" disabled={pending}>{pending?"处理中…":"免费规则示例"}</button>{live&&<button name="mode" value="ai" disabled={pending||!consent}>AI {titles[kind]}（1 次）</button>}</div>
 {!live&&<p className="muted">真实 AI 尚未开放；规则示例不调用模型、不扣费。</p>}{state.error&&<p role="alert" className="error">{state.error}</p>}</form>
 {state.report&&<section aria-live="polite" className="card"><span className="tag">{state.mode==="ai"?"AI 生成 · 请核实":"规则示例 · 非 AI"}</span><h2>练习报告</h2><p className="content">{state.report.summary}</p>{state.report.sections.map((s,i)=><div className="result" key={i}><h3>{s.title}</h3><ul>{s.items.map((t,j)=><li key={j}>{t}</li>)}</ul></div>)}<h3>下一步</h3><ol>{state.report.next.map((t,i)=><li key={i}>{t}</li>)}</ol><p className="muted">仅供个人练习，非录用判断；可自行复制保存。</p></section>}</>;
}
