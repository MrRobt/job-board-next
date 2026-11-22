/** A signed refund POST reply is not settlement evidence.
 * However, even provisional ACK requires an exact, explicit money match.
 * Any absent, malformed or divergent fee must be resolved by signed inquiry;
 * never automatically re-POST an uncertain merchant refund.
 */
export function assertAlipayRefundReplyAmount(fee:unknown, expectedFen:number):void {
  if(!Number.isSafeInteger(expectedFen)||expectedFen<=0||
     typeof fee!=="string"||!/^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/.test(fee))
    throw new Error("Alipay refund amount cannot be verified; inquiry required");
  const [yuan,cents]=fee.split(".");
  const actualFen=BigInt(yuan)*100n+BigInt(cents);
  if(actualFen!==BigInt(expectedFen))
    throw new Error("Alipay refund amount mismatch; inquiry required");
}
