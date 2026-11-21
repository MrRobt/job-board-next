/** Browser-memory-only interview progress. Never store the user's full answer. */
export const MAX_INTERVIEW_ROUNDS=5;
export type InterviewRound={
 question:string;
 summary:string;
 mode:"sample"|"ai";
};
export function appendInterviewRound(
 current:readonly InterviewRound[],
 next:InterviewRound
):InterviewRound[]{
 if(current.length>=MAX_INTERVIEW_ROUNDS)throw new Error("Interview round limit reached");
 const question=next.question.trim(),summary=next.summary.trim();
 if(question.length<5||question.length>5000||summary.length<1||summary.length>800||
    !["sample","ai"].includes(next.mode))
  throw new Error("Invalid interview round");
 return [...current,{question,summary,mode:next.mode}];
}
export function canStartInterviewRound(completed:number){
 return Number.isSafeInteger(completed)&&completed>=0&&completed<MAX_INTERVIEW_ROUNDS;
}
