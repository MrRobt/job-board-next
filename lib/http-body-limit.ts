/**
 * Read a webhook or merchant response without first allocating an unbounded
 * string. Signature verification must still use the exact decoded raw body.
 */
export async function readBoundedHttpText(
  source: Pick<Request, "headers" | "body">,
  maxBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Invalid HTTP body limit");
  }
  const advertised = source.headers.get("content-length");
  if (advertised !== null) {
    if (!/^\d+$/.test(advertised) || Number(advertised) > maxBytes) {
      throw new Error("Oversized HTTP body");
    }
  }
  if (!source.body) throw new Error("Empty HTTP body");
  const reader = source.body.getReader();
  let byteCount = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      byteCount += item.value.byteLength;
      if (byteCount > maxBytes) {
        await reader.cancel();
        throw new Error("Oversized HTTP body");
      }
      chunks.push(item.value);
    }
    return new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.concat(chunks, byteCount));
  } finally {
    reader.releaseLock();
  }
}
