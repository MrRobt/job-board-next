import {test} from "node:test";
import assert from "node:assert/strict";
import {syncOpsAlertScanWithStore,type OpsIncidentSyncStore} from "../lib/career/ops-incident-sync-service";
import type {OpsIncidentSnapshot} from "../lib/career/ops-incident-state";
import type {OpsIncidentKey} from "../lib/career/ops-incident-policy";

const t0=new Date("2026-11-21T15:00:00.000Z");
function fixture(failEventFor?:OpsIncidentKey){
 let rows=new Map<OpsIncidentKey,OpsIncidentSnapshot>();
 let events:{key:OpsIncidentKey;action:string}[]=[];
 let transactions=0;
 const store:OpsIncidentSyncStore={
  transaction:async callback=>{
   transactions++;
   const before=new Map([...rows].map(([k,r])=>[k,{...r}] as const));
   const oldEvents=[...events];
   try{return await callback({
    read:async key=>rows.get(key)??null,
    create:async next=>{if(rows.has(next.key))throw Error("duplicate");rows.set(next.key,next);},
    compareAndUpdate:async(prev,next)=>{
     const live=rows.get(prev.key);
     if(!live||live.state!==prev.state||live.openedAt.getTime()!==prev.openedAt.getTime()||
      live.lastSeenAt.getTime()!==prev.lastSeenAt.getTime()||live.count!==prev.count)return 0;
     rows.set(next.key,next);
     return 1;
    },
    append:async event=>{
     if(event.incidentKey===failEventFor)throw Error("simulated audit outage");
     events.push({key:event.incidentKey,action:event.action});
    }
   });}catch(e){rows=before;events=oldEvents;throw e;}
  }
 };
 return {store,read:()=>rows,events:()=>events,transactions:()=>transactions};
}
const alert={staleReservations:2,uncertainRefunds:1,agedReadyRefunds:0};
test("complete three-category scan writes all changes in exactly one transaction",async()=>{
 const f=fixture();
 const results=await syncOpsAlertScanWithStore(f.store,alert,t0);
 assert.equal(f.transactions(),1);
 assert.deepEqual(results.map(x=>x.event),["OPENED","OPENED",null]);
 assert.equal(f.read().size,2);
 assert.deepEqual(f.events().map(x=>x.key),["STALE_AI_RESERVATIONS","REFUND_IN_DOUBT"]);
 const cleared=await syncOpsAlertScanWithStore(f.store,{
  staleReservations:0,uncertainRefunds:0,agedReadyRefunds:0
 },new Date(t0.getTime()+1000));
 assert.equal(f.transactions(),2);
 assert.deepEqual(cleared.map(x=>x.event),["RESOLVED","RESOLVED",null]);
 assert.deepEqual([...f.read().values()].map(x=>x.state),["RESOLVED","RESOLVED"]);
});
test("last category audit failure rolls back earlier categories and events",async()=>{
 const f=fixture("REFUND_READY_AGED");
 await assert.rejects(syncOpsAlertScanWithStore(f.store,{
  staleReservations:2,uncertainRefunds:1,agedReadyRefunds:3
 },t0),/audit outage/);
 assert.equal(f.transactions(),1);
 assert.equal(f.read().size,0);
 assert.equal(f.events().length,0);
});
test("partial/negative/noninteger aggregates and bad scan time fail before transaction",async()=>{
 const f=fixture();
 for(const counts of [
  {staleReservations:1,uncertainRefunds:0},
  {staleReservations:1,uncertainRefunds:-1,agedReadyRefunds:0},
  {staleReservations:1,uncertainRefunds:0,agedReadyRefunds:1.5},
  {staleReservations:1,uncertainRefunds:0,agedReadyRefunds:Infinity}
 ]){
  await assert.rejects(async()=>syncOpsAlertScanWithStore(f.store,counts as any,t0));
 }
 await assert.rejects(async()=>syncOpsAlertScanWithStore(f.store,alert,new Date("invalid")));
 assert.equal(f.transactions(),0);
});
