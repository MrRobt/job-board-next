import "server-only";
import {createHash} from "node:crypto";
import {db} from "./db";
export async function allowAttempt(scope:string,identity:string,limit:number,minutes:number){
 const now=new Date(),resetAt=new Date(now.getTime()+minutes*60000);
 // Fixed windows use one unique row per identity and window; atomic increment on conflict.
 const window=Math.floor(now.getTime()/(minutes*60000));
 const key=createHash("sha256").update(scope+":"+identity+":"+window).digest("hex");
 const result=await db.authAttempt.upsert({where:{key},create:{key,count:1,resetAt},update:{count:{increment:1}}});
 return result.count<=limit;
}
