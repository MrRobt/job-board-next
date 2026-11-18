import { crossProductTradeCollisions } from "../lib/payment/cross-product-trade-audit";
import { db } from "../lib/db";

/**
 * Read-only, explicit operator action. A real payment/entitlement incident
 * must be investigated manually; this tool NEVER edits an order or grant.
 * Do not place merchant transaction data or database URLs into logs.
 */
async function main() {
  if (process.env.PAYMENT_TRADE_AUDIT_APPROVED !== "true") {
    throw new Error("Payment trade audit requires explicit operator approval");
  }
  const result = await crossProductTradeCollisions(30);
  console.log(JSON.stringify(result, null, 2));
  if (result.count > 0) process.exitCode = 2;
}

main().catch(() => {
  console.error("Payment trade audit unavailable; investigate privately");
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
