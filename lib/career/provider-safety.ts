import { isIP } from "node:net";

const forbiddenSuffixes = [
  ".localhost", ".local", ".internal", ".lan",
  ".test", ".invalid", ".example", ".onion", ".arpa",
];

/**
 * Return the normalized, approved OpenAI-compatible base URL.
 * Explicit exact-match approval is required before transmitting personal
 * career material or bearer credentials to a model provider.
 */
export function approvedModelBaseUrl(base: string | undefined, approved: string | undefined): string | null {
  if (!base || !approved || base.length > 500 ||
      base !== base.trim() || /[?#\\\u0000-\u0020]/.test(base)) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.port !== "" || !url.hostname.includes(".") ||
        isIP(url.hostname) !== 0) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.startsWith("[") || host.includes(":") ||
        forbiddenSuffixes.some(s => host.endsWith(s))) return null;
    if (!/^[a-z0-9.-]+$/.test(host)) return null;
    const normalized = url.href.replace(/\/+$/, "");
    // The allowlist itself must be provided via controlled server deployment
    // configuration, never an end-user form, cookie, or request header.
    const candidates = approved.split(",").map(value => value.trim());
    return candidates.includes(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/** Bounded streaming response read: never buffer an arbitrarily large body. */
export async function readBoundedModelResponse(
  response: Response, maxBytes = 200_000
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Invalid model response limit");
  }
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader) || Number(lengthHeader) > maxBytes) {
      throw new Error("Oversized model response");
    }
  }
  if (!response.body) throw new Error("Empty model response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Oversized model response");
      }
      chunks.push(part.value);
    }
    return new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.concat(chunks, total));
  } finally {
    reader.releaseLock();
  }
}
