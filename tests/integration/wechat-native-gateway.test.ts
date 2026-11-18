import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createWechatUrl } from "../../lib/payment/wechat";
import { sign } from "../../lib/payment/crypto";

const names = [
  "WECHAT_MCH_ID", "WECHAT_APP_ID", "WECHAT_MERCHANT_SERIAL",
  "WECHAT_PRIVATE_KEY", "WECHAT_PAY_PUBLIC_KEY_ID",
  "WECHAT_PAY_PUBLIC_KEY", "APP_ORIGIN",
];
const order = { id: "T" + "a".repeat(30), amountFen: 990, paymentExpiresAt: null, tool: true };

async function withMockGateway(run: (args: {
  signedBody: (body: string) => Response;
  setResponse: (fn: (url: URL, init: RequestInit) => Promise<Response>) => void;
}) => Promise<void>) {
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  try {
    process.env.WECHAT_MCH_ID = "merchant-test-id";
    process.env.WECHAT_APP_ID = "app-test-id";
    process.env.WECHAT_MERCHANT_SERIAL = "test-merchant-serial";
    process.env.WECHAT_PRIVATE_KEY = privateKey;
    process.env.WECHAT_PAY_PUBLIC_KEY_ID = "test-public-id";
    process.env.WECHAT_PAY_PUBLIC_KEY = publicKey;
    process.env.APP_ORIGIN = "https://payments.demo-company.cn";

    function signedBody(body: string): Response {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = "test-nonce";
      return new Response(body, {
        status: 200,
        headers: {
          "wechatpay-timestamp": timestamp,
          "wechatpay-nonce": nonce,
          "wechatpay-serial": "test-public-id",
          "wechatpay-signature": sign(timestamp + "\n" + nonce + "\n" + body + "\n", privateKey),
        },
      });
    }
    let responseFn: (url: URL, init: RequestInit) => Promise<Response> =
      async () => signedBody(JSON.stringify({ code_url: "weixin://wxpay/native/test-code" }));
    globalThis.fetch = async (url, init) => responseFn(new URL(String(url)), init ?? {});
    await run({ signedBody, setResponse(fn) { responseFn = fn; } });
  } finally {
    globalThis.fetch = previousFetch;
    for (const name of names) {
      const original = saved[name];
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
  }
}

test("WeChat Native order rejects redirects and signs the approved callback URL", async () => {
  await withMockGateway(async ({ signedBody, setResponse }) => {
    setResponse(async (url, init) => {
      assert.equal(url.href, "https://api.mch.weixin.qq.com/v3/pay/transactions/native");
      assert.equal(init.redirect, "error");
      assert.equal(init.method, "POST");
      assert.equal(init.cache, "no-store");
      const posted = JSON.parse(String(init.body));
      assert.equal(posted.out_trade_no, order.id);
      assert.equal(posted.amount.total, 990);
      assert.equal(posted.amount.currency, "CNY");
      assert.equal(posted.notify_url,
        "https://payments.demo-company.cn/api/tool-payment/wechat/notify");
      assert.match(new Headers(init.headers).get("authorization") ?? "", /^WECHATPAY2-/);
      return signedBody(JSON.stringify({ code_url: "weixin://wxpay/native/test-code" }));
    });
    assert.equal(await createWechatUrl(order), "weixin://wxpay/native/test-code");

    setResponse(async (_, init) => {
      assert.equal(init.redirect, "error");
      return Response.redirect("https://redirected.invalid", 302);
    });
    await assert.rejects(createWechatUrl(order), /WeChat order request failed/);
  });
});

test("WeChat Native rejects unsigned, invalid-serial or oversized merchant replies", async () => {
  await withMockGateway(async ({ signedBody, setResponse }) => {
    setResponse(async () => new Response(JSON.stringify({ code_url: "weixin://wxpay/native/no-signature" })));
    await assert.rejects(createWechatUrl(order), /Invalid WeChat signature/);

    setResponse(async () => {
      const good = signedBody(JSON.stringify({ code_url: "weixin://wxpay/native/normal" }));
      good.headers.set("wechatpay-serial", "another-merchant");
      return good;
    });
    await assert.rejects(createWechatUrl(order), /Invalid WeChat signature/);

    setResponse(async () => signedBody(JSON.stringify({ code_url: "https://redirect.example.cn" })));
    await assert.rejects(createWechatUrl(order), /startsWith|Invalid string/i);

    setResponse(async () => new Response("x", {
      status: 200, headers: { "content-length": "100001" },
    }));
    await assert.rejects(createWechatUrl(order), /Oversized HTTP body/);
  });
});
