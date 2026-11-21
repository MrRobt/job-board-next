import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {failOpsNotificationClaim,type OpsNotificationFailureRow} from "../lib/career/ops-notification-failure";
import {createPrismaOpsNotificationFailureStore} from "../lib/career/ops-notification-failure-prisma-store";

const key="d".repeat(64);
const token=randomUUID();
const now=new Date("2026-11-21T14:00:00Z");
const row={idempotencyKey:key,state:"CLAIMED" as const,claimToken:token,leaseExpiresAt:new Date(now.getTime()+60_000),attemptCount:2};

test("serializable status CAS writes one failure audit event without token or PII",async()=>{
 let state:OpsNotificationFailureRow={...row};let auditWrites=0;
 const store=createPrismaOpsNotificationFailureStore({
  $transaction:async(fn,options)=>{
   assert.equal(options.isolationLevel,"Serializable");
   return fn({
    opsIncidentNotificationIntent:{
     findUnique:async()=>state,
     updateMany:async args=>{
      assert.equal(args.where.claimToken,token);
      assert.equal(args.data.state,"RETRY_WAIT");
      state={...state,...args.data};
      return {count:1};
     }
    },
    opsNotificationFailureEvent:{
     create:async args=>{
      auditWrites++;
      assert.deepEqual(args.data,{
       intentKey:key,attemptCount:2,disposition:"RETRY_WAIT",failureCode:"TEMPORARY_FAILURE"
      });
      assert.equal(Object.hasOwn(args.data,"claimToken"),false);
      return {};
     }
    }
   });
  }
 });
 assert.equal((await failOpsNotificationClaim(store,key,token,"TEMPORARY_FAILURE",now)).status,"RETRY_WAIT");
 assert.equal(auditWrites,1);
 assert.equal((await failOpsNotificationClaim(store,key,token,"TEMPORARY_FAILURE",now)).status,"FENCED");
 assert.equal(auditWrites,1);
});

test("failed CAS does not write an audit event",async()=>{
 let events=0;
 const store=createPrismaOpsNotificationFailureStore({
  $transaction:async(fn)=>fn({
   opsIncidentNotificationIntent:{findUnique:async()=>row,updateMany:async()=>({count:0})},
   opsNotificationFailureEvent:{create:async()=>{events++;return {};}}
  })
 });
 assert.equal((await failOpsNotificationClaim(store,key,token,"TEMPORARY_FAILURE",now)).status,"CONFLICT");
 assert.equal(events,0);
});

test("failed audit insertion rejects the entire transaction; no success result",async()=>{
 const store=createPrismaOpsNotificationFailureStore({
  $transaction:async(fn)=>fn({
   opsIncidentNotificationIntent:{findUnique:async()=>row,updateMany:async()=>({count:1})},
   opsNotificationFailureEvent:{create:async()=>{throw Error("Audit write unavailable");}}
  })
 });
 await assert.rejects(failOpsNotificationClaim(store,key,token,"TEMPORARY_FAILURE",now),/Audit write unavailable/);
 // The real Prisma adapter uses a database transaction, so the corresponding
 // status CAS must roll back when the audit insert rejects.
});
