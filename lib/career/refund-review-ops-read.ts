/** Minimal read-only B04/B06 aggregate. The caller must enforce ADMIN
 * authentication and the independent ops read gate before invoking this.
 * No user/order/refund identifiers are selected or returned.
 */
export type RefundLedgerHoldReader={
 toolRefundInquiryEvent:{
  count(args:{where:{outcome:"MANUAL_LEDGER_REVIEW";
   dispatch:{is:{state:"IN_DOUBT"}}}}):Promise<number>;
 }
};
export async function countRefundLedgerReviewHolds(db:RefundLedgerHoldReader):Promise<number>{
 const value=await db.toolRefundInquiryEvent.count({
  where:{outcome:"MANUAL_LEDGER_REVIEW",dispatch:{is:{state:"IN_DOUBT"}}}
 });
 if(!Number.isSafeInteger(value)||value<0)
  throw Error("Invalid refund ledger review count");
 return value;
}
