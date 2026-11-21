import {test} from "node:test";
import assert from "node:assert/strict";
import {acknowledgeOpsIncidentWithStore,type OpsIncidentStore,type OpsIncidentTransaction} from "../lib/career/ops-incident-acknowledgment-service";
import type {OpsIncidentSnapshot} from "../lib/career/ops-incident-state";

const at=new Date("2026-11-21T12:00:00.000Z");
const reason="人工已核实异常退款，申请后续签名商户查询确认";
const open=():OpsIncidentSnapshot=>({
 key:"REFUND_IN_DOUBT",state:"OPEN",count:2,openedAt:at,lastSeenAt:at,
 acknowledgedAt:null,acknowledgedById:null,acknowledgmentNote:null,resolvedAt:null
});
const request={key:"REFUND_IN_DOUBT" as const,expectedOpenedAt:at,operatorId:"admin-1",reason};

function store(seed:OpsIncidentSnapshot|null=open(),role="ADMIN"){
 let state=seed;
 let audit:{action:string;operatorId:string;incidentKey:string}[]=[];
 let reads=0;
 let transactions=0;
 let race:((next:OpsIncidentSnapshot|null)=>OpsIncidentSnapshot|null)|null=null;
 const db:OpsIncidentStore={
  async transaction(fn){
   transactions++;
   let next=state;
   const staged:typeof audit=[];
   const tx:OpsIncidentTransaction={
    async operatorRole(id){return id==="admin-1"?role:id==="admin-2"?"ADMIN":"USER";},
    async incident(key){reads++;return next?.key===key?{...next}:null;},
    async compareAndAcknowledge(where,data){
     if(race){next=race(next);race=null;}
     if(!next||next.key!==where.key||next.state!==where.expectedState||
        next.openedAt.getTime()!==where.expectedOpenedAt.getTime())return 0;
     next={...next,...data};
     return 1;
    },
    async appendEvent(event){staged.push({action:event.action,operatorId:event.operatorId,incidentKey:event.incidentKey});}
   };
   const result=await fn(tx);
   state=next;
   audit=[...audit,...staged];
   return result;
  }
 };
 return {db,look:()=>state,events:()=>audit,reads:()=>reads,transactions:()=>transactions,
  injectRace:(fn:(current:OpsIncidentSnapshot|null)=>OpsIncidentSnapshot|null)=>{race=fn;}};
}

test("transaction verifies administrator and writes one CAS with one audit event",async()=>{
 const s=store();
 const outcome=await acknowledgeOpsIncidentWithStore(s.db,request,at);
 assert.equal(outcome,"ACKNOWLEDGED");
 assert.equal(s.look()?.state,"ACKNOWLEDGED");
 assert.equal(s.look()?.acknowledgedById,"admin-1");
 assert.deepEqual(s.events(),[{action:"ACKNOWLEDGED",operatorId:"admin-1",incidentKey:"REFUND_IN_DOUBT"}]);
 assert.equal(s.transactions(),1);
});

test("same acknowledgement is replay-safe without another audit; conflicting operator fails",async()=>{
 const s=store();
 assert.equal(await acknowledgeOpsIncidentWithStore(s.db,request,at),"ACKNOWLEDGED");
 assert.equal(await acknowledgeOpsIncidentWithStore(s.db,request,new Date(at.getTime()+1000)),"ALREADY_ACKNOWLEDGED");
 assert.equal(s.events().length,1);
 await assert.rejects(acknowledgeOpsIncidentWithStore(s.db,{...request,operatorId:"admin-2"},at),/already acknowledged/);
 assert.equal(s.events().length,1);
});

test("non-admin, missing incident, invalid reason and old episode never write",async()=>{
 const nonadmin=store(open(),"USER");
 await assert.rejects(acknowledgeOpsIncidentWithStore(nonadmin.db,request,at),/Administrator/);
 assert.equal(nonadmin.reads(),0);
 assert.equal(nonadmin.events().length,0);
 const missing=store(null);
 await assert.rejects(acknowledgeOpsIncidentWithStore(missing.db,request,at),/not found/);
 const old=store({...open(),openedAt:new Date(at.getTime()+1000)});
 await assert.rejects(acknowledgeOpsIncidentWithStore(old.db,request,new Date(at.getTime()+2000)),/episode/);
 const invalid=store();
 await assert.rejects(acknowledgeOpsIncidentWithStore(invalid.db,{...request,reason:"short"},at),/reason/);
 assert.equal(invalid.events().length,0);
});

test("CAS detects incident reopening between read and update: no audit",async()=>{
 const s=store();
 s.injectRace(current=>({...current!,openedAt:new Date(at.getTime()+1000)}));
 await assert.rejects(acknowledgeOpsIncidentWithStore(s.db,request,new Date(at.getTime()+2000)),/changed/);
 assert.equal(s.events().length,0);
 assert.equal(s.look()?.state,"OPEN");
});

test("transaction rolls back state if audit insertion fails",async()=>{
 let state=open();
 const db:OpsIncidentStore={
  async transaction(fn){
   let pending:OpsIncidentSnapshot=state;
   const tx:OpsIncidentTransaction={
    async operatorRole(){return "ADMIN";},
    async incident(){return {...pending};},
    async compareAndAcknowledge(_,changes){pending={...pending,...changes};return 1;},
    async appendEvent(){throw new Error("audit unavailable");}
   };
   const result=await fn(tx);
   state=pending;
   return result;
  }
 };
 await assert.rejects(acknowledgeOpsIncidentWithStore(db,request,at),/audit unavailable/);
 assert.equal(state.state,"OPEN");
});
