import { isIP } from "node:net";

/**
 * Validate the exact deployment-controlled public HTTPS callback origin.
 * No user input, proxy headers, IP literals or non-public hosts are accepted.
 * This checks URL syntax, not DNS; production egress/DNS protection remains
 * an independent mandatory deployment gate.
 */
export function validatedPaymentOrigin(value: string | undefined): string {
  if (!value || value.length > 253 ||
      value !== value.trim() || /[\s\\?#@\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Invalid payment callback origin");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid payment callback origin");
  }
  const host = url.hostname;
  const labels = host.split(".");
  const forbidden = [".localhost", ".local", ".internal", ".lan",
    ".home", ".test", ".invalid", ".example", ".onion", ".arpa"];

  if (url.protocol !== "https:" || url.port !== "" ||
      url.username || url.password || url.pathname !== "/" ||
      url.search || url.hash || isIP(host) !== 0 ||
      labels.length < 2 || host.endsWith(".") ||
      labels.some(label => label.length < 1 || label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
      !/[a-z]/.test(labels[labels.length - 1]) ||
      host === "localhost" || forbidden.some(s => host.endsWith(s)) ||
      (value !== url.origin && value !== url.origin + "/")) {
    throw new Error("Invalid payment callback origin");
  }
  return url.origin;
}
