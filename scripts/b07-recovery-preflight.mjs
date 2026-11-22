#!/usr/bin/env node
/**
 * B07 recovery readiness preflight. Read-only on an explicitly selected,
 * disposable MySQL migration test database. No backups, writes, or deletions.
 * Prints aggregated schema / migration / accounting signals only.
 */
import {PrismaClient} from "@prisma/client";
import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {join} from "node:path";
import {inspectCriticalRecoverySchema,recoveryMigrationDirectoryFromScript} from "./b07-recovery-schema.mjs";

const allowed=(value)=>{
 try{
  const url=new URL(value);
  return ["127.0.0.1","localhost"].includes(url.hostname)&&url.port==="3306"&&
   /^\/jobs_mvp_migrate_[0-9]{8}_[a-z0-9]+$/.test(url.pathname)&&
   !url.search&&!url.hash&&url.protocol==="mysql:";
 }catch{return false;}
};
const approved=process.env.DJS_RECOVERY_PREFLIGHT_APPROVED==="READ_ONLY"&&
 process.env.INTEGRATION_TEST_DATABASE==="true"&&
 process.env.NODE_ENV!=="production"&&allowed(process.env.DATABASE_URL||"");
if(!approved){
 console.error("B07 read-only preflight refused: explicit disposable-local approval required");
 process.exitCode=2;
}else{
 const name=new URL(process.env.DATABASE_URL).pathname.slice(1);
 const db=new PrismaClient();
 try{
  const [tables,columns,rows]=await Promise.all([
   db.$queryRaw`SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
   db.$queryRaw`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
   db.$queryRaw`SELECT migration_name AS name, checksum, finished_at AS finishedAt,
                 rolled_back_at AS rolledBackAt FROM _prisma_migrations ORDER BY started_at`
  ]);
  const {missingTables,missingColumns,unexpectedAmountTypes}=
   inspectCriticalRecoverySchema(tables,columns);
  const migrationDir=recoveryMigrationDirectoryFromScript(import.meta.url);
  const dirs=(await readdir(migrationDir,{
   withFileTypes:true
  })).filter(x=>x.isDirectory()).map(x=>x.name).sort();
  const local=new Map();
  for(const dir of dirs){
   const sql=await readFile(join(migrationDir,dir,"migration.sql"));
   local.set(dir,createHash("sha256").update(sql).digest("hex"));
  }
  const applied=new Set(rows.filter(x=>x.finishedAt&&!x.rolledBackAt).map(x=>x.name));
  const pending=dirs.filter(x=>!applied.has(x));
  const unknown=rows.filter(x=>!local.has(x.name)).map(x=>x.name);
  const broken=rows.filter(x=>!x.finishedAt&&!x.rolledBackAt).map(x=>x.name);
  const mismatched=rows.filter(x=>local.has(x.name)&&
   local.get(x.name)!==x.checksum).map(x=>x.name);
  const counts=missingTables.length?{inDoubt:null,reserved:null,paidFrozen:null}:{
   inDoubt:Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM ToolRefundDispatch WHERE state='IN_DOUBT'`)[0].n),
   reserved:Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM ToolRun WHERE status='RESERVED'`)[0].n),
   paidFrozen:Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM ToolOrder WHERE status='PAID' AND refundHold=TRUE`)[0].n)
  };
  const ok=!missingTables.length&&!missingColumns.length&&!unexpectedAmountTypes.length&&
   !pending.length&&!unknown.length&&!broken.length&&!mismatched.length&&
   dirs.length===rows.length;
  console.log(JSON.stringify({
   task:"B07_READ_ONLY_RECOVERY_PREFLIGHT",
   target:"DISPOSABLE_MYSQL_ONLY",database:name,status:ok?"PASS":"BLOCKED",
   migration:{localFiles:dirs.length,dbEntries:rows.length,
    pending,unknown,unfinished:broken,checksumMismatch:mismatched},
   criticalSchema:{missingTables,missingColumns,unexpectedAmountTypes},
   operationalSignals:counts,
   limitations:["No SQL backup or restore was performed",
    "No non-empty production database was tested",
    "No external merchant or model service was accessed",
    "Business recovery still requires independent authorized backup/restore UAT"]
  },null,2));
  if(!ok)process.exitCode=2;
 }catch(e){
  console.error("B07 read-only preflight blocked:",e?.code||e?.name||"unknown");
  process.exitCode=2;
 }finally{await db.$disconnect();}
}
