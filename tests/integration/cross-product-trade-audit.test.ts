import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../lib/db";
import { crossProductTradeCollisions } from "../../lib/payment/cross-product-trade-audit";

test("read-only audit finds historical cross-product duplicates without returning merchant trade numbers", async () => {
  if(process.env.INTEGRATION_TEST_DATABASE !== "true")
    throw new Error("Isolated MySQL only");
  const tag=randomUUID();
  const trade="ALIPAY:AUDIT"+tag.replace(/-/g,"");
  let userId="",categoryId="",jobId="",legacyOrderId="",toolOrderId="";
  try {
    userId=(await db.user.create({data:{
      email:tag+"-audit@example.invalid",passwordHash:"test-only"
    }})).id;
    categoryId=(await db.category.create({data:{name:"audit-"+tag}})).id;
    jobId=(await db.job.create({data:{
      categoryId,title:"Test audit fixture",company:"Test",city:"Test",
      employment:"Full-time",salary:"Test",summary:"public",details:"private",
      sourceUrl:"https://example.invalid",priceFen:990,status:"PUBLISHED",publishedAt:new Date()
    }})).id;
    legacyOrderId=(await db.order.create({data:{
      userId,jobId,amountFen:990,provider:"ALIPAY",status:"PAID",providerTradeId:trade
    }})).id;
    toolOrderId="T"+tag.replace(/-/g,"").slice(0,30);
    await db.toolOrder.create({data:{
      id:toolOrderId,userId,sku:"STARTER20",amountFen:990,credits:20,
      provider:"ALIPAY",status:"PAID",providerTradeId:trade
    }});
    const audit=await crossProductTradeCollisions();
    assert.ok(audit.count>=1);
    const match=audit.sample.find(row=>row.legacyOrderId===legacyOrderId &&
      row.toolOrderId===toolOrderId);
    assert.ok(match);
    assert.equal(match.tradeFingerprint,createHash("sha256").update(trade).digest("hex"));
    assert.equal(JSON.stringify(audit).includes(trade),false,"do not leak merchant transaction reference");
    assert.equal(match.legacyStatus,"PAID");
    assert.equal(match.toolStatus,"PAID");
    await assert.rejects(crossProductTradeCollisions(0),/Invalid collision audit/);
    await assert.rejects(crossProductTradeCollisions(100),/Invalid collision audit/);
  } finally {
    if(toolOrderId)await db.toolOrder.deleteMany({where:{id:toolOrderId}});
    if(legacyOrderId)await db.order.deleteMany({where:{id:legacyOrderId}});
    if(jobId)await db.job.deleteMany({where:{id:jobId}});
    if(categoryId)await db.category.deleteMany({where:{id:categoryId}});
    if(userId)await db.user.deleteMany({where:{id:userId}});
    await db.$disconnect();
  }
});
