import {test} from "node:test";
import assert from "node:assert/strict";
import {hashPassword,verifyPassword} from "../lib/password";
test("password hash is salted and verifies only matching passwords",()=>{const hash=hashPassword("some-password-123");assert.notEqual(hash,hashPassword("some-password-123"));assert.equal(verifyPassword("some-password-123",hash),true);assert.equal(verifyPassword("wrong",hash),false);assert.equal(verifyPassword("wrong","malformed"),false);});