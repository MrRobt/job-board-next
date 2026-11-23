import "server-only";
import { db } from "./db";

export type AuthRetentionResult = {
  mode: "DRY_RUN" | "APPLIED";
  expiredSessions: number;
  expiredAttempts: number;
  expiredVerificationTokens: number;
  deletedSessions: number;
  deletedVerificationTokens: number;
  deletedAttempts: number;
};

/**
 * Bounded pruning for obsolete auth records only. Never touches User,
 * orders, entitlements, audit, refund cases, or non-expired sessions.
 * Default is a read-only preview.
 */
export async function pruneExpiredAuthRecords(options: {
  now?: Date;
  batchSize?: number;
  apply?: boolean;
} = {}): Promise<AuthRetentionResult> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 200;
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid maintenance time");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Maintenance batch size must be 1-1000");
  }

  // Read-only estimate uses the same inclusive boundary as deletion.
  const [expiredSessions, expiredAttempts, expiredVerificationTokens] = await Promise.all([
    db.session.count({ where: { expiresAt: { lte: now } } }),
    db.authAttempt.count({ where: { resetAt: { lte: now } } }),
    db.emailVerificationToken.count({ where: { expiresAt: { lte: now } } }),
  ]);
  if (!options.apply) {
    return {
      mode: "DRY_RUN", expiredSessions, expiredAttempts, expiredVerificationTokens,
      deletedSessions: 0, deletedAttempts: 0, deletedVerificationTokens: 0,
    };
  }

  // Only select a bounded set of immutable primary keys; recheck the expiry
  // predicate on DELETE so a concurrently updated row is not pruned.
  const [sessions, attempts, verificationTokens] = await Promise.all([
    db.session.findMany({
      where: { expiresAt: { lte: now } }, select: { tokenHash: true },
      orderBy: [{ expiresAt: "asc" }, { tokenHash: "asc" }], take: batchSize,
    }),
    db.authAttempt.findMany({
      where: { resetAt: { lte: now } }, select: { key: true },
      orderBy: [{ resetAt: "asc" }, { key: "asc" }], take: batchSize,
    }),
    db.emailVerificationToken.findMany({
      where: { expiresAt: { lte: now } }, select: { tokenHash: true },
      orderBy: [{ expiresAt: "asc" }, { tokenHash: "asc" }], take: batchSize,
    }),
  ]);
  const [deletedSessions, deletedAttempts, {count: deletedVerificationTokens}] = await db.$transaction([
    db.session.deleteMany({
      where: {
        tokenHash: { in: sessions.map(s => s.tokenHash) },
        expiresAt: { lte: now },
      },
    }),
    db.authAttempt.deleteMany({
      where: {
        key: { in: attempts.map(a => a.key) },
        resetAt: { lte: now },
      },
    }),
    db.emailVerificationToken.deleteMany({
      where: {
        tokenHash: { in: verificationTokens.map(t => t.tokenHash) },
        expiresAt: { lte: now },
      },
    }),
  ]);
  return {
    mode: "APPLIED", expiredSessions, expiredAttempts, expiredVerificationTokens,
    deletedSessions: deletedSessions.count, deletedAttempts: deletedAttempts.count,
    deletedVerificationTokens,
  };
}
