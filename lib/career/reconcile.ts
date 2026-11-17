import "server-only";
import {db} from "../db";
import {STALE_AFTER_MINUTES} from "./audit";

/**
 * An operator must verify there was no effective AI delivery before refunding
 * a stranded reservation. Both the status transition and the grant adjustment
 * are committed together, with an immutable audit entry.
 */
export async function refundStaleReservation(runId:string,operatorId:string,reason:string){
 const note=reason.trim();
 if(note.length<10||note.length>500)throw new Error("A specific reconciliation reason is required");
 const cutoff=new Date(Date.now()-STALE_AFTER_MINUTES*60_000);
 return db.$transaction(async tx=>{
  const operator=await tx.user.findUnique({where:{id:operatorId},select:{role:true}});
  if(operator?.role!=="ADMIN")throw new Error("Administrator required");
  const run=await tx.toolRun.findUnique({
   where:{id:runId},
   select:{id:true,grantId:true,status:true,createdAt:true}
  });
  if(!run||run.status!=="RESERVED"||run.createdAt>=cutoff)throw new Error("Reservation not eligible");
  const changed=await tx.toolRun.updateMany({
   where:{id:run.id,status:"RESERVED",createdAt:{lt:cutoff}},
   data:{status:"FAILED",finishedAt:new Date()}
  });
  if(changed.count!==1)throw new Error("Concurrent reconciliation; reload");
  await tx.toolGrant.update({
   where:{id:run.grantId},
   data:{remaining:{increment:1}}
  });
  await tx.toolRunAdjustment.create({
   data:{runId:run.id,operatorId,reason:note}
  });
  return true;
 });
}
