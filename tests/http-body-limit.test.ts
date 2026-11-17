import { test } from "node:test";
import assert from "node:assert/strict";
import { readBoundedHttpText } from "../lib/http-body-limit";

test("webhook request reads exact bytes within the cap", async () => {
  const body = new Request("https://callback.example.test/notify", {
    method: "POST", body: "abc", headers: { "content-length": "3" },
  });
  assert.equal(await readBoundedHttpText(body, 3), "abc");
});

test("body cap counts raw UTF-8 bytes, not JavaScript character length", async () => {
  const body = new Request("https://callback.example.test/notify", {
    method: "POST", body: "中文",
  });
  await assert.rejects(readBoundedHttpText(body, 5), /Oversized HTTP body/);
});

test("forged or oversized Content-Length fails even before reading the stream", async () => {
  const body = new Response("ok", { headers: { "content-length": "99999999" } });
  await assert.rejects(readBoundedHttpText(body, 1024), /Oversized HTTP body/);
  const invalid = new Response("ok", { headers: { "content-length": "2, 999999" } });
  await assert.rejects(readBoundedHttpText(invalid, 1024), /Oversized HTTP body/);
});

test("streamed body still rejects overage when declared length is small or missing", async () => {
  const body = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello"));
      controller.enqueue(new TextEncoder().encode("world"));
      controller.close();
    },
  }), { headers: { "content-length": "4" } });
  await assert.rejects(readBoundedHttpText(body, 8), /Oversized HTTP body/);
});

test("empty and invalid UTF-8 body cannot become a signed webhook payload", async () => {
  await assert.rejects(readBoundedHttpText(new Response(null), 64), /Empty HTTP body/);
  await assert.rejects(
    readBoundedHttpText(new Response(Uint8Array.of(0xc3, 0x28)), 64),
    /not valid|encoded|UTF-8/i,
  );
  await assert.rejects(readBoundedHttpText(new Response("a"), 0), /Invalid HTTP body limit/);
});
