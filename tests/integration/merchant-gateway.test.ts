import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {liveGateway} from "../../lib/payment/merchant-gateway";
import {canonical,sign,verify} from "../../lib/payment/crypto";

function keys(){
 return generateKeyPairSync("rsa",{modulusLength:2048,
  privateKeyEncoding:{type:"pkcs8",format:"pem"},
  publicKeyEncoding:{type:"spki",format:"pem"}});
}
function withEnv(values:Record<string,string>){
 const original=new Map(Object.keys(values).map(k=>[k,process.env[k]]));
 for(const [key,val] of Object.entries(values))process.env[key]=val;
 return ()=>{for(const [key,old] of original){if(old===undefined)delete process.env[key];else process.env[key]=old;}};
}
test("WeChat V3 signed query and 204 close handle merchant identity and bad signature",async()=>{
 const merchant=keys(),platform=keys();
 const undo=withEnv({
  WECHAT_APP_ID:"wx_local",WECHAT_MCH_ID:"mch_local",WECHAT_MERCHANT_SERIAL:"local_serial",
  WECHAT_PRIVATE_KEY:merchant.privateKey,WECHAT_PAY_PUBLIC_KEY_ID:"PUB_KEY_LOCAL",
  WECHAT_PAY_PUBLIC_KEY:platform.publicKey
 });
 const saved=globalThis.fetch;
 try{
  let calls=0;
  globalThis.fetch=(async(url,init)=>{
   assert.match(String(url),/^https:\/\/api.mch.weixin.qq.com\/v3\/pay\/transactions\/out-trade-no\/T/);
   assert.match(String(init?.headers&&("Authorization" in init.headers?init.headers.Authorization:"")),/WECHATPAY2-SHA256-RSA2048/);
   calls++;
   if(init?.method==="POST")return new Response(null,{status:204});
   const raw=JSON.stringify({appid:"wx_local",mchid:"mch_local",out_trade_no:"T"+"a".repeat(30),trade_state:"SUCCESS",trade_type:"NATIVE",transaction_id:"trade-local",amount:{total:990,currency:"CNY"}});
   const timestamp=Math.floor(Date.now()/1000).toString(),nonce="local-nonce";
   return new Response(raw,{status:200,headers:{
    "wechatpay-timestamp":timestamp,"wechatpay-nonce":nonce,
    "wechatpay-serial":"PUB_KEY_LOCAL","wechatpay-signature":sign(timestamp+"\n"+nonce+"\n"+raw+"\n",platform.privateKey)
   }});
  }) as typeof fetch;
  const observed=await liveGateway.query("T"+"a".repeat(30),"WECHAT");
  assert.equal(observed.state,"PAID");
  if(observed.state==="PAID")assert.equal(observed.notice.amountFen,990);
  await liveGateway.close("T"+"a".repeat(30),"WECHAT");
  assert.equal(calls,2);
  globalThis.fetch=(async()=>new Response('{"appid":"wx_local"}',{status:200})) as typeof fetch;
  await assert.rejects(liveGateway.query("T"+"a".repeat(30),"WECHAT"),/Unverified/);
 }finally{globalThis.fetch=saved;undo();}
});
test("Alipay OpenAPI query checks signed exact response and seller",async()=>{
 const merchant=keys(),platform=keys();
 const undo=withEnv({ALIPAY_APP_ID:"alipay_local",ALIPAY_SELLER_ID:"seller_local",ALIPAY_PRIVATE_KEY:merchant.privateKey,ALIPAY_PUBLIC_KEY:platform.publicKey});
 const saved=globalThis.fetch;
 try{
  let valid=true;
  globalThis.fetch=(async(url,init)=>{
   assert.equal(url,"https://openapi.alipay.com/gateway.do");
   const form=new URLSearchParams(String(init?.body));
   assert.equal(form.get("method"),"alipay.trade.query");
   const req=Object.fromEntries(form);
   const sig=req.sign;delete req.sign;
   assert.ok(sig&&verify(canonical(req),sig,merchant.publicKey));
   const obj=JSON.stringify({code:"10000",msg:"Success",out_trade_no:"T"+"b".repeat(30),seller_id:"seller_local",trade_status:"TRADE_SUCCESS",trade_no:"merchant-alipay-tx",total_amount:"29.90"});
   const responseSig=sign(obj,platform.privateKey);
   return new Response('{"alipay_trade_query_response":'+obj+',"sign":"'+(valid?responseSig:"bad")+'"}',{status:200});
  }) as typeof fetch;
  const observed=await liveGateway.query("T"+"b".repeat(30),"ALIPAY");
  assert.equal(observed.state,"PAID");
  if(observed.state==="PAID")assert.equal(observed.notice.amountFen,2990);
  valid=false;
  await assert.rejects(liveGateway.query("T"+"b".repeat(30),"ALIPAY"),/Unverified/);
 }finally{globalThis.fetch=saved;undo();}
});
