import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveOrder,settlePayment} from "../../lib/payment/settlement";
import {getJobDetails} from "../../lib/jobs";
test("MySQL purchase lifecycle: deny unpaid, reject bad notifications, idempotent paid and revoke refunded",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Set INTEGRATION_TEST_DATABASE=true only against disposable test DB");
 const tag=randomUUID();
 let userId="",otherId="",categoryId="",jobId="";
 try{
 const user=await db.user.create({data:{email:tag+"@example.invalid",passwordHash:"test-only"}});
 userId=user.id;
 const other=await db.user.create({data:{email:tag+"-other@example.invalid",passwordHash:"test-only"}});
 otherId=other.id;
 const category=await db.category.create({data:{name:"integration-"+tag}});
 categoryId=category.id;
 const job=await db.job.create({data:{categoryId,title:"Integration paid job",company:"Test",city:"Test",employment:"Full-time",salary:"Test",summary:"public",details:"private-content-"+tag,sourceUrl:"https://example.invalid",priceFen:390,status:"PUBLISHED",publishedAt:new Date()}});
 jobId=job.id;
 assert.equal(await getJobDetails(jobId),null);
 assert.equal(await getJobDetails(jobId,userId),null);
 const order=await reserveOrder(userId,jobId,"ALIPAY");
 const repeat=await reserveOrder(userId,jobId,"ALIPAY");
 assert.equal(repeat.id,order.id);
 await assert.rejects(reserveOrder(userId,jobId,"WECHAT"));
 const notice={provider:"ALIPAY" as const,orderId:order.id,tradeId:tag,amountFen:390};
 await assert.rejects(settlePayment({...notice,amountFen:1}));
 await assert.rejects(settlePayment({...notice,provider:"WECHAT"}));
 assert.equal(await getJobDetails(jobId,userId),null);
 await settlePayment(notice);
 await settlePayment(notice);
 await assert.rejects(settlePayment({...notice,tradeId:tag+"-invalid"}));
 assert.equal(await db.order.count({where:{userId,jobId}}),1);
 assert.equal(await db.unlock.count({where:{userId,jobId}}),1);
 assert.equal((await getJobDetails(jobId,userId))?.details,"private-content-"+tag);
 assert.equal(await getJobDetails(jobId,otherId),null);
 await db.order.update({where:{id:order.id},data:{status:"REFUNDED"}});
 assert.equal(await getJobDetails(jobId,userId),null);
 }finally{
 if(jobId){await db.unlock.deleteMany({where:{jobId}});await db.order.deleteMany({where:{jobId}});await db.job.deleteMany({where:{id:jobId}});}
 if(categoryId)await db.category.deleteMany({where:{id:categoryId}});
 await db.user.deleteMany({where:{id:{in:[userId,otherId].filter(Boolean)}}});
 await db.$disconnect();
 }
});
