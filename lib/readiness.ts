import { createHash, timingSafeEqual } from "node:crypto";

/** Secret is supplied only by the trusted deployment environment. */
export function readinessAuthorized(expected: string | undefined, supplied: string | null): boolean {
  if (!expected || expected.length < 32 || expected.length > 256 ||
      !supplied || supplied.length > 256) return false;
  const expectedDigest = createHash("sha256").update(expected).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

/** No exception message, connection string, or SQL detail is exposed. */
export async function checkReadiness(probe: () => Promise<unknown>): Promise<"ok" | "unavailable"> {
  try {
    await probe();
    return "ok";
  } catch {
    return "unavailable";
  }
}
