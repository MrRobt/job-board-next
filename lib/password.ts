import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const saltPattern = /^[a-f0-9]{32}$/;
const digestPattern = /^[a-f0-9]{128}$/;

async function deriveKey(password: string, salt: string): Promise<Buffer> {
  return (await derive(password, salt, 64)) as Buffer;
}

/**
 * Keep the existing salt:hex-digest storage format and scrypt parameters.
 * Async scrypt runs in the Node worker pool instead of blocking the event loop.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new Error("Invalid password length");
  const salt = randomBytes(16).toString("hex");
  const digest = await deriveKey(password, salt);
  return salt + ":" + digest.toString("hex");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2 || !saltPattern.test(parts[0]) ||
      !digestPattern.test(parts[1]) || password.length > 128) return false;
  const expected = Buffer.from(parts[1], "hex");
  const actual = await deriveKey(password, parts[0]);
  return timingSafeEqual(expected, actual);
}
