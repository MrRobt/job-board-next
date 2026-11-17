import type {Channel} from "./config";
import type {PaymentNotice} from "./settlement";

export type MerchantObservation =
 | {state:"PAID";notice:PaymentNotice}
 | {state:"UNPAID"}
 | {state:"CLOSED"}
 | {state:"UNKNOWN"};

export function checkedMerchantPayment(
 provider:Channel,
 orderId:string,
 status:string,
 amountFen?:number,
 tradeId?:string
):MerchantObservation {
 if(status==="UNPAID")return {state:"UNPAID"};
 if(status==="CLOSED")return {state:"CLOSED"};
 if(status!=="PAID")return {state:"UNKNOWN"};
 if(!tradeId||tradeId.length>120||!Number.isSafeInteger(amountFen)||!amountFen||amountFen<=0){
  throw new Error("Incomplete confirmed payment");
 }
 return {state:"PAID",notice:{provider,orderId,tradeId,amountFen}};
}
