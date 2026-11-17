import "server-only";
import {db} from "../db";

export const STALE_AFTER_MINUTES = 10;

/**
 * Detect credit reservations that did not reach a final state.
 * Never settle or refund these automatically: a timed-out response can still
 * represent an upstream model call that was actually completed.
 */
export async function staleCreditReservations(now:Date=new Date()){
 const cutoff=new Date(now.getTime()-STALE_AFTER_MINUTES*60_000);
 const where={status:"RESERVED" as const,createdAt:{lt:cutoff}};
 const [count,rows]=await Promise.all([
  db.toolRun.count({where}),
  db.toolRun.findMany({
   where,orderBy:[{createdAt:"asc"},{id:"asc"}],take:50,
   select:{id:true,kind:true,createdAt:true,user:{select:{email:true}},grant:{select:{orderId:true}}}
  })
 ]);
 return {count,cutoff,rows};
}
