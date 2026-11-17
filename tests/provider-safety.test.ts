import { test } from "node:test";
import assert from "node:assert/strict";
import { approvedModelBaseUrl, readBoundedModelResponse } from "../lib/career/provider-safety";

test("model endpoint requires explicit exact approval and a public HTTPS DNS name", () => {
  assert.equal(approvedModelBaseUrl("https://api.openai.com/v1", undefined), null);
  assert.equal(approvedModelBaseUrl("https://api.openai.com/v1",
    "https://api.openai.com/v1"), "https://api.openai.com/v1");
  assert.equal(approvedModelBaseUrl("https://api.openai.com/v1/",
    "https://other.example.net, https://api.openai.com/v1"), "https://api.openai.com/v1");
  assert.equal(approvedModelBaseUrl("https://api.openai.com/v2",
    "https://api.openai.com/v1"), null);
  assert.equal(approvedModelBaseUrl("https://evil.example.net/v1",
    "https://api.openai.com/v1"), null);
});

test("local, private, malformed and URL-credential-bearing model endpoints are denied", () => {
  const blocked = [
    "http://api.openai.com/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.5/v1",
    "https://169.254.169.254/v1",
    "https://[::1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://localhost/v1",
    "https://service.internal/v1",
    "https://model.local/v1",
    "https://api.openai.com:8443/v1",
    "https://username@api.openai.com/v1",
    "https://api.openai.com/v1?token=bad",
    "https://api.openai.com/v1#section",
    " https://api.openai.com/v1 ",
  ];
  for (const url of blocked) {
    assert.equal(approvedModelBaseUrl(url, url), null, url);
  }
});

test("small streamed model body can be parsed but oversized and malformed bodies are rejected early", async () => {
  const response = new Response(JSON.stringify({ ok: true }));
  assert.equal(await readBoundedModelResponse(response, 100), '{"ok":true}');
  await assert.rejects(
    readBoundedModelResponse(new Response("abcde"), 3), /Oversized/,
  );
  await assert.rejects(
    readBoundedModelResponse(new Response("abcd", {
      headers: { "content-length": "12345678" },
    }), 100), /Oversized/,
  );
  const fake = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("aa"));
      controller.enqueue(new TextEncoder().encode("bb"));
      controller.enqueue(new TextEncoder().encode("cc"));
      controller.close();
    },
  }));
  await assert.rejects(readBoundedModelResponse(fake, 4), /Oversized/);
  await assert.rejects(
    readBoundedModelResponse(new Response(""), 0), /Invalid model response limit/,
  );
});
