import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";

/**
 * Atomic, cross-instance fixed-window throttling. Prisma's emulated upsert can
 * race when several requests first create the same key, so use MySQL's native
 * ON DUPLICATE KEY UPDATE and read the counter while holding its row lock.
 */
export async function allowAttempt(scope: string, identity: string, limit: number, minutes: number) {
  if (!Number.isSafeInteger(limit) || limit <= 0 ||
      !Number.isSafeInteger(minutes) || minutes <= 0) throw new Error("Invalid rate-limit config");
  const windowMs = minutes * 60000;
  const window = Math.floor(Date.now() / windowMs);
  const resetAt = new Date((window + 1) * windowMs);
  const key = createHash("sha256").update(scope + ":" + identity + ":" + window).digest("hex");
  return db.$transaction(async tx => {
    await tx.$executeRaw`
      INSERT INTO \`AuthAttempt\` (\`key\`, \`count\`, \`resetAt\`)
      VALUES (${key}, 1, ${resetAt})
      ON DUPLICATE KEY UPDATE \`count\` = LEAST(\`count\` + 1, ${limit + 1})
    `;
    // Read within the same transaction to avoid observing another request's
    // later increment as our result.
    const record = await tx.authAttempt.findUnique({
      where: { key }, select: { count: true },
    });
    return record !== null && record.count <= limit;
  });
}
