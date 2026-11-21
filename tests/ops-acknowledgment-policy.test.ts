import {test} from "node:test";
import assert from "node:assert/strict";
import {prepareOpsAcknowledgment} from "../lib/career/ops-acknowledgment-policy";
import type {OpsIncidentSnapshot} from "../lib/career/ops-incident-state";

const openedAt=new Date("2026-11-21T10:00:00.000Z");
const now=new Date("2026-11-21T10:10:00.000Z");
const incident:OpsIncidentSnapshot={
 key:"REFUND_IN_DOUBT",state:"OPEN",count:2,
 openedAt,lastSeenAt:openedAt,acknowledgedAt:null,
 acknowledgedById:null,acknowledgmentNote:null,resolvedAt:null
};
const command={key:"REFUND_IN_DOUBT" as const,expectedOpenedAt:openedAt,
 operatorId:"admin-1",operatorRole:"ADMIN" as const,
 reason:"已查看异常退款记录及核对清单，正在人工复查商户状态"};

/** Only the caller may atomically persist this CAS-backed proposal with its audit event. */
test("authorized admin gets a scoped acknowledgement proposal without writes",()=>{
 const result=prepareOpsAcknowledgment(incident,command,now);
 assert.equal(result.outcome,"ACKNOWLEDGE");
 assert.equal(result.next?.state,"ACKNOWLEDGED");
 assert.equal(result.next?.acknowledgedById,"admin-1");
 assert.equal(result.next?.acknowledgedAt?.getTime(),now.getTime());
 assert.equal(result.next?.acknowledgmentNote,command.reason);
 assert.equal(result.cas?.expectedState,"OPEN");
 assert.equal(result.cas?.expectedOpenedAt.getTime(),openedAt.getTime());
 assert.equal(incident.state,"OPEN");
});

test("stale episode and wrong incident key fail closed",()=>{
 const reopened={...incident,openedAt:new Date(openedAt.getTime()+60_000)};
 assert.throws(()=>prepareOpsAcknowledgment(reopened,command,now),/episode/);
 assert.throws(()=>prepareOpsAcknowledgment(incident,{...command,key:"STALE_AI_RESERVATIONS"},now),/category/);
 assert.throws(()=>prepareOpsAcknowledgment(null,command,now),/not found/);
 assert.throws(()=>prepareOpsAcknowledgment({...incident,state:"RESOLVED"},command,now),/resolved/);
});

test("only admin with bounded meaningful reason may acknowledge",()=>{
 assert.throws(()=>prepareOpsAcknowledgment(incident,{...command,operatorRole:"USER"},now),/Administrator/);
 assert.throws(()=>prepareOpsAcknowledgment(incident,{...command,operatorId:" "},now),/operator/);
 assert.throws(()=>prepareOpsAcknowledgment(incident,{...command,reason:"short"},now),/reason/);
 assert.throws(()=>prepareOpsAcknowledgment(incident,{...command,reason:"x".repeat(501)},now),/reason/);
 assert.throws(()=>prepareOpsAcknowledgment(incident,{...command,reason:"\n".repeat(16)},now),/reason/);
 assert.throws(()=>prepareOpsAcknowledgment(incident,{...command,reason:"confirmed\u0000hello blah"},now),/reason/);
});

test("repeated identical acknowledgement is idempotent but other operator cannot claim it",()=>{
 const first=prepareOpsAcknowledgment(incident,command,now);
 assert.ok(first.next);
 const same=prepareOpsAcknowledgment(first.next,command,new Date(now.getTime()+1000));
 assert.equal(same.outcome,"ALREADY_ACKNOWLEDGED");
 assert.equal(same.next,null);
 assert.equal(same.cas,null);
 assert.throws(()=>prepareOpsAcknowledgment(first.next,{...command,operatorId:"admin-2"},now),/already acknowledged/);
 assert.throws(()=>prepareOpsAcknowledgment(first.next,{...command,reason:"另一条不一致的审核理由不少于十字符"},now),/already acknowledged/);
});

test("invalid time, future observation or inconsistent acknowledgement fails closed",()=>{
 assert.throws(()=>prepareOpsAcknowledgment(incident,command,new Date("invalid")),/time/);
 assert.throws(()=>prepareOpsAcknowledgment(incident,command,new Date(openedAt.getTime()-1)),/time/);
 assert.throws(()=>prepareOpsAcknowledgment({...incident,lastSeenAt:new Date(now.getTime()+1)},command,now),/time/);
 assert.throws(()=>prepareOpsAcknowledgment({...incident,acknowledgedAt:now},command,now),/Inconsistent/);
});
