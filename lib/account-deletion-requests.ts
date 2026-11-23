import "server-only";
import {db} from "./db";

/** Records an idempotent manual review request. No account, order or right is erased. */
export async function requestAccountDeletionReview(userId:string){
 if(!userId)throw new Error("Authenticated account required");
 await db.accountDeletionRequest.createMany({
  data:[{userId,status:"PENDING_MANUAL_REVIEW"}],skipDuplicates:true
 });
 return db.accountDeletionRequest.findUniqueOrThrow({
  where:{userId},select:{id:true,status:true,requestedAt:true}
 });
}
