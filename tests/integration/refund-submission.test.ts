import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {approveRefundIntent} from "../../lib/career/refund-approvals";
import {queueApprovedRefund} from "../../lib/career/refund-dispatch-outbox";
import {submitPreparedRefundOnce} from "../../lib/career/refund-sender";
import {liveRefundSubmissionGateway,type RefundSubmissionGateway} from "../../lib/payment/refund-submit";
import {prepareMerchantRefund,type MerchantRefundIntent} from "../../lib/payment/refund-request-payload";
import {canonical,sign,verify} from "../../lib/payment/crypto";

function keys(){
 return generateKeyPairSync("rsa",{modulusLength:2048,
  privateKeyEncoding:{format:"pem",type:"pkcs8"},publicKeyEncoding:{format:"pem",type:"spki"}});
}
function withEnv(values:Record<string,string>){
 const prior=new Map(Object.keys(values).map(k=>[k,process.env[k]]));
 for(const [key,value] of Object.entries(values))process.env[key]=value;
 return ()=>{for(const [key,v] of prior){if(v===undefined)delete process.env[key];else process.env[key]=v;}};
}
const baseIntent=(provider:"WECHAT"|"ALIPAY"):MerchantRefundIntent=>({
 caseId:"testcase123456",orderId:"T"+"a".repeat(30),provider,
 providerTradeId:provider+":pay-123",originalAmountFen:990,refundAmountFen:990,
 reason:"service refund"
});

test("WeChat refund POST signs exact JSON, checks signed identity and never returns settled",async()=>{
 const merchant=keys(),platform=keys(),intent=baseIntent("WECHAT");
 const prepared=prepareMerchantRefund(intent);
 const undo=withEnv({
  ENABLE_REAL_PAYMENT:"true",ENABLE_REFUND_DISPATCH_CLAIM:"true",ENABLE_REFUND_SEND:"true",
  WECHAT_APP_ID:"wx_local",WECHAT_MCH_ID:"mch_local",
  WECHAT_MERCHANT_SERIAL:"merchant-serial",WECHAT_PRIVATE_KEY:merchant.privateKey,
  WECHAT_PAY_PUBLIC_KEY_ID:"PUB_KEY_LOCAL",WECHAT_PAY_PUBLIC_KEY:platform.publicKey
 });
 const original=globalThis.fetch;
 let bad=false,calls=0;
 let missingTransaction=false,wrongTransaction=false;
 let merchantStatus="SUCCESS";
 try{
  globalThis.fetch=(async(url,init)=>{
   calls++;
   assert.equal(String(url),"https://api.mch.weixin.qq.com/v3/refund/domestic/refunds");
   assert.equal(init?.method,"POST");
   assert.equal(init?.redirect,"error");
   const headers=new Headers(init?.headers),authorization=headers.get("Authorization")??"";
   const timestamp=authorization.match(/timestamp="([^"]+)"/)?.[1]??"";
   const nonce=authorization.match(/nonce_str="([^"]+)"/)?.[1]??"";
   const signature=authorization.match(/signature="([^"]+)"/)?.[1]??"";
   const body=String(init?.body);
   assert.ok(verify("POST\n/v3/refund/domestic/refunds\n"+timestamp+"\n"+nonce+"\n"+body+"\n",signature,merchant.publicKey));
   const sent=JSON.parse(body);
   assert.equal(sent.out_refund_no,prepared.outRefundNo);
   assert.equal(sent.amount.refund,990);
   const result=JSON.stringify({
    out_trade_no:intent.orderId,out_refund_no:bad?"R"+"b".repeat(30):prepared.outRefundNo,
    ...(missingTransaction?{}:{transaction_id:wrongTransaction?"different-payment":"pay-123"}),status:merchantStatus,
    amount:{refund:990,total:990,currency:"CNY"}
   });
   const ts=String(Math.floor(Date.now()/1000)),responseNonce="reply-nonce";
   return new Response(result,{status:200,headers:{
    "wechatpay-timestamp":ts,"wechatpay-nonce":responseNonce,
    "wechatpay-serial":"PUB_KEY_LOCAL",
    "wechatpay-signature":sign(ts+"\n"+responseNonce+"\n"+result+"\n",platform.privateKey)
   }});
  }) as typeof fetch;
  assert.equal(await liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),"ACKNOWLEDGED");
  merchantStatus="PROCESSING";
  assert.equal(await liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),"ACKNOWLEDGED");
  merchantStatus="CLOSED";
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/inquiry required/);
  merchantStatus="ABNORMAL";
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/inquiry required/);
  merchantStatus="UNKNOWN_REMOTE_STATUS";
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/inquiry required/);
  merchantStatus="SUCCESS";
  missingTransaction=true;
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/transaction mismatch/);
  missingTransaction=false;wrongTransaction=true;
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/transaction mismatch/);
  wrongTransaction=false;bad=true;
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/request mismatch/);
  assert.equal(calls,8);
  process.env.ENABLE_REFUND_SEND="false";
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/disabled/);
  assert.equal(calls,8);
 }finally{globalThis.fetch=original;undo();}
});

test("Alipay refund POST requires RSA2 response and matches merchant order/trade",async()=>{
 const merchant=keys(),platform=keys(),intent=baseIntent("ALIPAY");
 const prepared=prepareMerchantRefund(intent);
 const undo=withEnv({
  ENABLE_REAL_PAYMENT:"true",ENABLE_REFUND_DISPATCH_CLAIM:"true",ENABLE_REFUND_SEND:"true",
  ALIPAY_APP_ID:"app-local",ALIPAY_SELLER_ID:"seller-local",
  ALIPAY_PRIVATE_KEY:merchant.privateKey,ALIPAY_PUBLIC_KEY:platform.publicKey,
  ALIPAY_GATEWAY:"https://openapi.alipay.com/gateway.do"
 });
 const original=globalThis.fetch;
 let wrongSignature=false,calls=0;
 let refundFee:string|undefined="9.90";
 try{
  globalThis.fetch=(async(url,init)=>{
   calls++;
   assert.equal(String(url),"https://openapi.alipay.com/gateway.do");
   const params=Object.fromEntries(new URLSearchParams(String(init?.body)));
   const sig=params.sign;delete params.sign;
   assert.ok(sig&&verify(canonical(params),sig,merchant.publicKey));
   assert.equal(params.method,"alipay.trade.refund");
   const request=JSON.parse(params.biz_content);
   assert.equal(request.out_request_no,prepared.outRefundNo);
   assert.equal(request.refund_amount,"9.90");
   const body=JSON.stringify({code:"10000",msg:"Success",out_trade_no:intent.orderId,
    trade_no:"pay-123",refund_fee:refundFee,fund_change:"Y",seller_id:"seller-local"});
   return new Response('{"alipay_trade_refund_response":'+body+',"sign":"'+
    (wrongSignature?"bad":sign(body,platform.privateKey))+'"}',{status:200});
  }) as typeof fetch;
  assert.equal(await liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),"ACKNOWLEDGED");
  refundFee="9.91";
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/amount mismatch/);
  refundFee="9.89";
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/amount mismatch/);
  refundFee=undefined;
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/inquiry required/);
  refundFee="9.90";
  wrongSignature=true;
  await assert.rejects(liveRefundSubmissionGateway.submit(intent,prepared.fingerprint),/Unverified/);
  assert.equal(calls,5);
 }finally{globalThis.fetch=original;undo();}
});

test("durable one-shot refund submission cannot POST twice after a crash or timeout",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable MySQL required");
 const tag=randomUUID();
 const users:string[]=[];
 const user=async(name:string,role:"ADMIN"|"USER"="USER")=>{
  const u=await db.user.create({data:{email:tag+name+"@example.invalid",passwordHash:"test-only",role}});
  users.push(u.id);return u;
 };
 const buyer=await user("-buyer"),maker=await user("-maker","ADMIN"),
  checker=await user("-checker","ADMIN"),operator=await user("-operator","ADMIN"),
  outsider=await user("-outsider");
 const undo=withEnv({
  ENABLE_REAL_PAYMENT:"true",ENABLE_REFUND_DISPATCH_CLAIM:"true",ENABLE_REFUND_SEND:"false",
  ALIPAY_APP_ID:"test-id",ALIPAY_SELLER_ID:"test-seller",
  ALIPAY_PRIVATE_KEY:"test-key",ALIPAY_PUBLIC_KEY:"test-key"
 });
 try{
  const order=await reserveToolOrder(buyer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"send-"+tag,amountFen:990});
  const ticket=await requestToolRefund(buyer.id,order.id,"客户尚未使用过已购买服务，申请人工复核退款");
  const prepared=await prepareReviewedRefund(ticket.id,maker.id,"已经核实余额未使用、金额正确，提交第二管理员审批");
  await approveRefundIntent(prepared.id,checker.id,"第二管理员确认原订单、支付金额和权益账本无误");
  const dispatch=await queueApprovedRefund(prepared.id,operator.id);
  let sent=0;
  const gateway:RefundSubmissionGateway={async submit(request,fingerprint){
   sent++;
   assert.equal(request.orderId,order.id);
   assert.equal(fingerprint,prepared.fingerprint);
   return "ACKNOWLEDGED";
  }};
  await assert.rejects(submitPreparedRefundOnce(dispatch.id,operator.id,gateway),/disabled/);
  assert.equal((await db.toolRefundDispatch.findUniqueOrThrow({where:{id:dispatch.id}})).state,"READY");
  process.env.ENABLE_REFUND_SEND="true";
  await assert.rejects(submitPreparedRefundOnce(dispatch.id,outsider.id,gateway),/Administrator/);
  assert.equal((await submitPreparedRefundOnce(dispatch.id,operator.id,gateway)),"IN_DOUBT");
  assert.equal(sent,1);
  await assert.rejects(submitPreparedRefundOnce(dispatch.id,operator.id,gateway),/inquiry|retry|requires/);
  assert.equal(sent,1);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20);
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id,observed:"ACKNOWLEDGED"}}),1);

  const second=await reserveToolOrder(buyer.id,"PRO100","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:second.id,tradeId:"send-other-"+tag,amountFen:2990});
  const otherTicket=await requestToolRefund(buyer.id,second.id,"第二笔退款申请准备模拟上游超时并保证不能重复扣款");
  const otherIntent=await prepareReviewedRefund(otherTicket.id,maker.id,"已核对第二笔退款无 AI 次数消费，申请第二人复审");
  await approveRefundIntent(otherIntent.id,checker.id,"第二管理员复核金额与未使用次数，同意创建唯一请求");
  const otherDispatch=await queueApprovedRefund(otherIntent.id,operator.id);
  const failing:RefundSubmissionGateway={async submit(){sent++;throw new Error("simulated timeout");}};
  await assert.rejects(submitPreparedRefundOnce(otherDispatch.id,operator.id,failing),/outcome uncertain/);
  await assert.rejects(submitPreparedRefundOnce(otherDispatch.id,operator.id,failing),/inquiry|retry|requires/);
  assert.equal(sent,2);
  assert.equal((await db.toolRefundDispatch.findUniqueOrThrow({where:{id:otherDispatch.id}})).state,"IN_DOUBT");
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:otherDispatch.id,observed:"UNCERTAIN"}}),1);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:second.id}})).status,"PAID");
 }finally{
  undo();
  await db.toolRefundInquiryEvent.deleteMany({where:{dispatch:{intent:{order:{userId:buyer.id}}}}});
  await db.toolRefundDispatch.deleteMany({where:{intent:{order:{userId:buyer.id}}}});
  await db.toolRefundIntent.deleteMany({where:{order:{userId:buyer.id}}});
  await db.toolRefundCase.deleteMany({where:{userId:buyer.id}});
  await db.toolRun.deleteMany({where:{userId:buyer.id}});
  await db.toolGrant.deleteMany({where:{userId:buyer.id}});
  await db.toolOrder.deleteMany({where:{userId:buyer.id}});
  await db.user.deleteMany({where:{id:{in:users}}});
  await db.$disconnect();
 }
});
