import "server-only";
import {enabled,type Channel} from "../payment/config";
import {liveAvailable} from "./provider";
import {mockPaymentEnabled} from "../payment/mock";
export function toolPaymentEnabled(channel:Channel){return process.env.ENABLE_TOOL_PAYMENTS==="true"&&process.env.TOOL_PAYMENT_APPROVED==="true"&&liveAvailable()&&enabled(channel);}
export function toolMockEnabled(){return mockPaymentEnabled()&&process.env.ENABLE_REAL_PAYMENT!=="true";}
