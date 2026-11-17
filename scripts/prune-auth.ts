import { pruneExpiredAuthRecords } from "../lib/auth-retention";
import { db } from "../lib/db";

async function run() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    throw new Error("Usage: npm run auth:retention [-- --apply]");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured");
  const apply = args[0] === "--apply";
  if (apply && process.env.AUTH_RETENTION_APPLY_APPROVED !== "true") {
    throw new Error("Apply blocked: explicit AUTH_RETENTION_APPLY_APPROVED=true required");
  }
  const result = await pruneExpiredAuthRecords({ apply, batchSize: 200 });
  // Counts only. Never emit session tokens, IP hashes, email, DSN, or user data.
  process.stdout.write(JSON.stringify(result) + "\n");
  if (!apply) {
    process.stdout.write("Preview only; run with --apply and explicit approval to prune.\n");
  }
}

run()
  .catch(error => {
    process.stderr.write("Auth retention failed: " +
      (error instanceof Error ? error.message : "unknown error") + "\n");
    process.exitCode = 1;
  })
  .finally(async () => { await db.$disconnect(); });
