import { isIP } from "node:net";

const allowedHeaders = new Set(["x-real-ip", "cf-connecting-ip"]);

/**
 * Read a single IP supplied by a trusted reverse proxy.
 *
 * Security prerequisite: the publicly exposed reverse proxy MUST overwrite
 * the selected header, and the application origin MUST reject direct traffic.
 * Never trust X-Forwarded-For lists or any header chosen by the HTTP client.
 * Returns null on missing/ambiguous/malformed values (fail closed if enabled).
 */
export function trustedClientIp(headers: Pick<Headers, "get">, configuredHeader?: string): string | null {
  const name = configuredHeader?.toLowerCase();
  if (!name || !allowedHeaders.has(name)) return null;
  const value = headers.get(name);
  if (!value || value.length > 45 || value.includes(",") ||
      value !== value.trim() || /[\s%/\\]/.test(value)) return null;
  const version = isIP(value);
  if (version === 4) return value;
  if (version === 6) {
    // URL normalizes equivalent IPv6 representations for a stable limiter key.
    try { return new URL("http://[" + value + "]/").hostname.slice(1, -1).toLowerCase(); }
    catch { return null; }
  }
  return null;
}
