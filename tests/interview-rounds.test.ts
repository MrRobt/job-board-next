import {test} from "node:test";
import assert from "node:assert/strict";
import {
 appendInterviewRound,canStartInterviewRound,MAX_INTERVIEW_ROUNDS
} from "../lib/career/interview-rounds";

const round=(n:number)=>({
 question:"请描述第 "+n+" 轮的项目问题",
 summary:"请说明行动与可验证结果",
 mode:"sample" as const
});
test("interview session advances five memory-only rounds without retaining answers",()=>{
 let history:ReturnType<typeof appendInterviewRound>=[];
 for(let i=0;i<MAX_INTERVIEW_ROUNDS;i++){
  assert.equal(canStartInterviewRound(history.length),true);
  const next=appendInterviewRound(history,round(i+1));
  assert.equal(history.length,i,"previous immutable history preserved");
  history=next;
 }
 assert.equal(history.length,5);
 assert.equal(canStartInterviewRound(history.length),false);
 assert.throws(()=>appendInterviewRound(history,round(6)),/limit/);
 const serialized=JSON.stringify(history);
 assert.ok(!serialized.includes("answer"));
});
test("interview progress refuses malformed or oversized round summaries",()=>{
 assert.throws(()=>appendInterviewRound([],{...round(1),question:"a"}),/Invalid/);
 assert.throws(()=>appendInterviewRound([],{...round(1),summary:"x".repeat(900)}),/Invalid/);
 assert.throws(()=>appendInterviewRound([],{...round(1),mode:"unexpected" as "ai"}),/Invalid/);
 assert.equal(canStartInterviewRound(-1),false);
 assert.equal(canStartInterviewRound(1.2),false);
});
