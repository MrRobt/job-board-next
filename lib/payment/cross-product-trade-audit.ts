import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { Prisma } from "@prisma/client";

type TradeCollisionRow = {
  legacyOrderId: string;
  toolOrderId: string;
  tradeReference: string;
  legacyStatus: "PENDING" | "PAID" | "CLOSED" | "REFUNDED";
  toolStatus: "PENDING" | "PAID" | "CLOSED" | "REFUNDED";
};
export type TradeCollision = Omit<TradeCollisionRow, "tradeReference"> & {
  /** A non-reversible correlate, never a raw merchant transaction identifier. */
  tradeFingerprint: string;
};

/**
 * Incident-only, read-only audit; not a public API or permission grant.
 * Detects legacy and AI product orders whose provider transaction IDs collide.
 * This is a snapshot for authorized operators to investigate manually.
 */
export async function crossProductTradeCollisions(take = 30): Promise<{
  count: number;
  sample: TradeCollision[];
}> {
  if (!Number.isSafeInteger(take) || take < 1 || take > 50) {
    throw new Error("Invalid collision audit sample limit");
  }
  const [counts, rows] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total
      FROM ${Prisma.raw("`Order`")} AS legacy
      INNER JOIN ToolOrder AS tool
        ON legacy.providerTradeId = tool.providerTradeId
      WHERE legacy.providerTradeId IS NOT NULL
    `,
    db.$queryRaw<TradeCollisionRow[]>`
      SELECT legacy.id AS legacyOrderId,
             tool.id AS toolOrderId,
             legacy.providerTradeId AS tradeReference,
             legacy.status AS legacyStatus,
             tool.status AS toolStatus
      FROM ${Prisma.raw("`Order`")} AS legacy
      INNER JOIN ToolOrder AS tool
        ON legacy.providerTradeId = tool.providerTradeId
      WHERE legacy.providerTradeId IS NOT NULL
      ORDER BY legacy.id ASC
      LIMIT ${take}
    `
  ]);
  const total = Number(counts[0]?.total ?? 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid audit count");
  return {
    count: total,
    sample: rows.map(({ tradeReference, ...rest }) => ({
      ...rest,
      tradeFingerprint: createHash("sha256").update(tradeReference).digest("hex"),
    })),
  };
}
