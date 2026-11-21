import {test} from "node:test";
import assert from "node:assert/strict";
import {createPrismaOpsIncidentStore} from "../lib/career/ops-incident-prisma-store";
import {acknowledgeOpsIncidentWithStore} from "../lib/career/ops-incident-acknowledgment-service";

const now=new Date("2026-11-21T10:02:00.000Z");
const openedAt=new Date("2026-11-21T10:00:00.000Z");
const reason="管理员已核实退款状态，准备核对渠道签名查询结果";
const req={key:"REFUND_IN_DOUBT" as const,expectedOpenedAt:openedAt,operatorId:"admin-1",reason};

function prismaMock(opts:{role?:string;cas?:number;failAudit?:boolean}={}){
 let state:any={key:req.key,state:"OPEN",count:2,openedAt,lastSeenAt:openedAt,
  acknowledgedAt:null,acknowledgedById:null,acknowledgmentNote:null,resolvedAt:null};
 const events:any[]=[];
 const calls:string[]=[];
 const client={
  async $transaction<T>(fn:(tx:any)=>Promise<T>,args?:unknown){
   calls.push("transaction");
   assert.deepEqual(args,{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
   const before=state?{...state}:null;
   const length=events.length;
   try{return await fn({
    user:{findUnique:async(o:any)=>{calls.push("role");assert.deepEqual(o,{where:{id:"admin-1"},select:{role:true}});return {role:opts.role??"ADMIN"};}},
    opsAlertIncident:{
     findUnique:async(o:any)=>{calls.push("read");assert.deepEqual(o,{where:{key:req.key}});return state&&{...state};},
     updateMany:async(o:any)=>{
      calls.push("cas");
      assert.deepEqual(o.where,{key:req.key,state:"OPEN",openedAt});
      assert.equal(o.data.state,"ACKNOWLEDGED");
      assert.equal(o.data.acknowledgedById,"admin-1");
      if(opts.cas===0)return {count:0};
      state={...state,...o.data};
      return {count:1};
     }
    },
    opsAlertIncidentEvent:{create:async(o:any)=>{
     calls.push("audit");
     if(opts.failAudit)throw new Error("test audit crash");
     assert.equal(o.data.incidentKey,req.key);
     assert.equal(o.data.operatorId,"admin-1");
     assert.equal(o.data.count,2);
     assert.equal(o.data.note,reason);
     assert.equal(o.data.action,"ACKNOWLEDGED");
     events.push(o.data);
     return {id:"event"};
    }}
   });}catch(e){state=before;events.length=length;throw e;}
  }
 };
 return {client,calls,events,read:()=>state};
}

test("Prisma adapter uses serializable role-read + scoped updateMany + audit in one transaction",async()=>{
 const f=prismaMock();
 const result=await acknowledgeOpsIncidentWithStore(createPrismaOpsIncidentStore(f.client),req,now);
 assert.equal(result,"ACKNOWLEDGED");
 assert.deepEqual(f.calls,["transaction","role","read","cas","audit"]);
 assert.equal(f.read().state,"ACKNOWLEDGED");
 assert.equal(f.events.length,1);
});

test("Prisma adapter refuses a non-admin before querying incident",async()=>{
 const f=prismaMock({role:"USER"});
 await assert.rejects(acknowledgeOpsIncidentWithStore(createPrismaOpsIncidentStore(f.client),req,now),/Administrator/);
 assert.deepEqual(f.calls,["transaction","role"]);
 assert.equal(f.events.length,0);
});

test("Prisma adapter CAS conflict never inserts audit",async()=>{
 const f=prismaMock({cas:0});
 await assert.rejects(acknowledgeOpsIncidentWithStore(createPrismaOpsIncidentStore(f.client),req,now),/changed/);
 assert.deepEqual(f.calls,["transaction","role","read","cas"]);
 assert.equal(f.events.length,0);
});

test("Prisma adapter audit failure rolls back acknowledgment",async()=>{
 const f=prismaMock({failAudit:true});
 await assert.rejects(acknowledgeOpsIncidentWithStore(createPrismaOpsIncidentStore(f.client),req,now),/audit crash/);
 assert.equal(f.read().state,"OPEN");
 assert.equal(f.events.length,0);
});

test("Prisma adapter retry is read-only, with no second CAS or audit",async()=>{
 const f=prismaMock();
 const store=createPrismaOpsIncidentStore(f.client);
 assert.equal(await acknowledgeOpsIncidentWithStore(store,req,now),"ACKNOWLEDGED");
 assert.equal(await acknowledgeOpsIncidentWithStore(store,req,new Date(now.getTime()+1000)),"ALREADY_ACKNOWLEDGED");
 assert.deepEqual(f.calls.slice(-3),["transaction","role","read"]);
 assert.equal(f.events.length,1);
});
