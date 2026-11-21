import {test} from "node:test";
import assert from "node:assert/strict";
import {syncOpsIncidentWithStore,type OpsIncidentSyncStore} from "../lib/career/ops-incident-sync-service";
import type {OpsIncidentSnapshot} from "../lib/career/ops-incident-state";

const start=new Date("2026-11-21T09:00:00.000Z");
const after=(n:number)=>new Date(start.getTime()+n*1000);
function fixture(options:{casConflict?:boolean;auditFails?:boolean}={}){
 let current:OpsIncidentSnapshot|null=null;
 const events:{action:string;count:number}[]=[];
 const calls:string[]=[];
 const store:OpsIncidentSyncStore={
  transaction:async callback=>{
   const before=current&&{...current};
   const oldEvents=events.length;
   calls.push("tx");
   try{return await callback({
    read:async key=>{calls.push("read");return current?.key===key?{...current}:null;},
    create:async next=>{calls.push("create");if(current)throw Error("unique conflict");current={...next};},
    compareAndUpdate:async(prev,next)=>{
     calls.push("cas");
     if(options.casConflict)return 0;
     if(!current||current.state!==prev.state||current.count!==prev.count||
       current.openedAt.getTime()!==prev.openedAt.getTime()||
       current.lastSeenAt.getTime()!==prev.lastSeenAt.getTime())return 0;
     current={...next};return 1;
    },
    append:async event=>{
     calls.push("audit");
     if(options.auditFails)throw Error("audit write unavailable");
     events.push({action:event.action,count:event.count});
    }
   });}catch(e){current=before;events.length=oldEvents;throw e;}
  }
 };
 return {store,events,calls,read:()=>current};
}
const key="REFUND_IN_DOUBT";
test("scanner opens, refreshes, resolves, and reopens exactly one event per episode transition",async()=>{
 const f=fixture();
 assert.deepEqual(await syncOpsIncidentWithStore(f.store,key,0,start),
  {key,state:"ABSENT",event:null,count:0});
 assert.equal(f.read(),null);
 assert.equal((await syncOpsIncidentWithStore(f.store,key,2,after(1))).event,"OPENED");
 assert.equal((await syncOpsIncidentWithStore(f.store,key,3,after(2))).event,null);
 assert.equal((await syncOpsIncidentWithStore(f.store,key,0,after(3))).event,"RESOLVED");
 assert.equal((await syncOpsIncidentWithStore(f.store,key,0,after(4))).event,null);
 assert.equal((await syncOpsIncidentWithStore(f.store,key,1,after(5))).event,"REOPENED");
 assert.deepEqual(f.events.map(e=>e.action),["OPENED","RESOLVED","REOPENED"]);
 assert.equal(f.read()?.state,"OPEN");
 assert.equal(f.read()?.count,1);
});
test("new scanner incident never invents an administrator acknowledgment",async()=>{
 const f=fixture();
 await syncOpsIncidentWithStore(f.store,key,2,start);
 const snapshot=f.read()!;
 // Simulate a separate authenticated action in the same durable incident row.
 // The transition function already covers the ACK state; here prove scanner
 // produced events without ever supplying a spoofable operator or note.
 assert.equal(snapshot.acknowledgedById,null);
 assert.equal(snapshot.acknowledgmentNote,null);
 assert.equal(snapshot.acknowledgedAt,null);
 assert.equal(f.events.length,1);
});
test("concurrent scan CAS collision never emits audit and rolls back",async()=>{
 const f=fixture({casConflict:true});
 await syncOpsIncidentWithStore(f.store,key,1,start);
 await assert.rejects(syncOpsIncidentWithStore(f.store,key,2,after(1)),/concurrently/);
 assert.equal(f.read()?.count,1);
 assert.deepEqual(f.events.map(e=>e.action),["OPENED"]);
});
test("audit failure rolls back both opening row and resolving transition",async()=>{
 const failed=fixture({auditFails:true});
 await assert.rejects(syncOpsIncidentWithStore(failed.store,key,2,start),/audit write/);
 assert.equal(failed.read(),null);
 assert.equal(failed.events.length,0);
});
test("invalid count and stale or invalid clock never persist changes",async()=>{
 const f=fixture();
 await syncOpsIncidentWithStore(f.store,key,1,start);
 for(const [count,now] of [[-1,after(1)],[1,after(-1)],[1,new Date("invalid")]] as const){
  await assert.rejects(syncOpsIncidentWithStore(f.store,key,count,now));
 }
 assert.equal(f.read()?.count,1);
 assert.deepEqual(f.events.map(e=>e.action),["OPENED"]);
});
