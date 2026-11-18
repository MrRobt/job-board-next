import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveOrder,settlePayment} from "../../lib/payment/settlement";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";

test("a merchant transaction cannot settle both a legacy purchase and an AI credit pack", async () => {
  if(process.env.INTEGRATION_TEST_DATABASE !== "true") throw new Error("Disposable MySQL required");
  const tag = randomUUID();
  const users:string[] = [];
  let categoryId = "";
  let jobId = "";
  const pairs:{legacyId:string;toolId:string}[] = [];
  try {
    const category = await db.category.create({data:{name:"trade-isolation-"+tag}});
    categoryId=category.id;
    const job=await db.job.create({data:{
      categoryId, title:"Test trade isolation",company:"Test",city:"Test",employment:"Full-time",
      salary:"Test",summary:"public",details:"private",sourceUrl:"https://example.invalid",
      priceFen:990,status:"PUBLISHED",publishedAt:new Date()
    }});
    jobId=job.id;
    for(let i=0;i<8;i++){
      const user=await db.user.create({data:{email:tag+"-"+i+"@example.invalid",passwordHash:"test-only"}});
      users.push(user.id);
      const legacy=await reserveOrder(user.id,job.id,"ALIPAY");
      const tool=await reserveToolOrder(user.id,"STARTER20","ALIPAY");
      pairs.push({legacyId:legacy.id,toolId:tool.id});
    }
    for(let i=0;i<2;i++){
      const trade="TRADE"+randomUUID().replace(/-/g,"");
      const old={provider:"ALIPAY" as const,orderId:pairs[i].legacyId,tradeId:trade,amountFen:990};
      const tool={provider:"ALIPAY" as const,orderId:pairs[i].toolId,tradeId:trade,amountFen:990};
      if(i===0){
        await settlePayment(old);
        await assert.rejects(settleToolPayment(tool), /Transaction already|belongs|duplicate|unique|conflict/i);
      } else {
        await settleToolPayment(tool);
        await assert.rejects(settlePayment(old), /Transaction already|belongs|duplicate|unique|conflict/i);
      }
      const oldPaid=(await db.order.findUniqueOrThrow({where:{id:old.orderId}})).status==="PAID";
      const toolPaid=(await db.toolOrder.findUniqueOrThrow({where:{id:tool.orderId}})).status==="PAID";
      assert.equal(Number(oldPaid)+Number(toolPaid),1);
    }
    for(let i=2;i<8;i++){
    const trade="TRADE"+randomUUID().replace(/-/g,"");
    const old={provider:"ALIPAY" as const,orderId:pairs[i].legacyId,tradeId:trade,amountFen:990};
    const tool={provider:"ALIPAY" as const,orderId:pairs[i].toolId,tradeId:trade,amountFen:990};
    const outcomes=await Promise.allSettled([settlePayment(old),settleToolPayment(tool)]);
    assert.ok(outcomes.filter(v=>v.status==="fulfilled").length<=1,
      "concurrent settlement must not unlock both products for one merchant trade");
    const oldPaid=(await db.order.findUniqueOrThrow({where:{id:old.orderId}})).status==="PAID";
    const toolPaid=(await db.toolOrder.findUniqueOrThrow({where:{id:tool.orderId}})).status==="PAID";
    assert.ok(Number(oldPaid)+Number(toolPaid)<=1);
    assert.ok((await db.unlock.count({where:{orderId:old.orderId}}))+
      (await db.toolGrant.count({where:{orderId:tool.orderId}}))<=1);
    }
  }finally{
    if(users.length){
      await db.toolRun.deleteMany({where:{userId:{in:users}}});
      await db.toolGrant.deleteMany({where:{userId:{in:users}}});
      await db.unlock.deleteMany({where:{userId:{in:users}}});
      await db.toolOrder.deleteMany({where:{userId:{in:users}}});
      await db.order.deleteMany({where:{userId:{in:users}}});
      await db.user.deleteMany({where:{id:{in:users}}});
    }
    if(jobId)await db.job.deleteMany({where:{id:jobId}});
    if(categoryId)await db.category.deleteMany({where:{id:categoryId}});
    await db.$disconnect();
  }
});
