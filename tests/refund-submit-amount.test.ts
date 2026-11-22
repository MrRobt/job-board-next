import {test} from "node:test";
import assert from "node:assert/strict";
import {assertAlipayRefundReplyAmount} from "../lib/payment/refund-submit-amount";

test("refund reply must prove the exact requested amount in integer fen",()=>{
  assert.doesNotThrow(()=>assertAlipayRefundReplyAmount("9.90",990));
  assert.doesNotThrow(()=>assertAlipayRefundReplyAmount("29.90",2990));
});

test("signed amount greater, smaller, absent or malformed must require inquiry",()=>{
  for(const value of ["9.91","9.89",undefined,"","0","0.00","9.9","9.900",
    "009.90","9.90 CNY","NaN","-9.90","9999999999999999999.90"]){
    assert.throws(()=>assertAlipayRefundReplyAmount(value,990),/inquiry required/);
  }
});

test("invalid expected amount is rejected without accepting any merchant reply",()=>{
  for(const expected of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>assertAlipayRefundReplyAmount("9.90",expected),/inquiry required/);
  }
});
