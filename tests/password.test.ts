import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/password";

test("async password scrypt retains salted 16-byte-salt:64-byte-digest format", async () => {
  const first = hashPassword("some-password-123");
  assert.equal(typeof first.then, "function", "hash work must be promise-based");
  const [hash, second] = await Promise.all([first, hashPassword("some-password-123")]);
  assert.match(hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.notEqual(hash, second);
  assert.equal(await verifyPassword("some-password-123", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("wrong", "malformed"), false);
});

test("async verification supports exact existing synchronous scrypt hashes", async () => {
  const salt = "a".repeat(32);
  const legacy = salt + ":" + scryptSync("legacy-password-123", salt, 64).toString("hex");
  assert.equal(await verifyPassword("legacy-password-123", legacy), true);
  assert.equal(await verifyPassword("wrong", legacy), false);
  assert.equal(await verifyPassword("legacy-password-123", legacy + ":extra"), false);
  assert.equal(await verifyPassword("legacy-password-123", "bad:" + "0".repeat(128)), false);
});

test("async hashing handles concurrent registrations and rejects unsafe stored formats", async () => {
  const passwords = Array.from({ length: 6 }, (_, i) => "candidate-password-" + i);
  const hashes = await Promise.all(passwords.map(hashPassword));
  assert.equal(new Set(hashes).size, 6);
  assert.deepEqual(await Promise.all(hashes.map((hash, i) => verifyPassword(passwords[i], hash))),
    Array.from({ length: 6 }, () => true));
  await assert.rejects(hashPassword("short"), /Invalid password length/);
  await assert.rejects(hashPassword("x".repeat(129)), /Invalid password length/);
  assert.equal(await verifyPassword("x".repeat(129), hashes[0]), false);
});
