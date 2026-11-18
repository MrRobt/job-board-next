import "server-only";
import { validatedPaymentOrigin } from "./origin-policy";

export type Channel="ALIPAY"|"WECHAT";
export function env(name:string){const value=process.env[name];if(!value)throw new Error("Missing payment configuration: "+name);return value.replace(/\\n/g,"\n");}
const keys={ALIPAY:["ALIPAY_APP_ID","ALIPAY_SELLER_ID","ALIPAY_PRIVATE_KEY","ALIPAY_PUBLIC_KEY"],WECHAT:["WECHAT_APP_ID","WECHAT_MCH_ID","WECHAT_MERCHANT_SERIAL","WECHAT_PRIVATE_KEY","WECHAT_PAY_PUBLIC_KEY_ID","WECHAT_PAY_PUBLIC_KEY","WECHAT_API_V3_KEY"]};

/** A configured payment channel must use the very same validated origin as callback URL generation. */
export function enabled(channel:Channel){
  try {
    if(process.env.ENABLE_REAL_PAYMENT!=="true" || !(channel in keys))return false;
    validatedPaymentOrigin(env("APP_ORIGIN"));
    return keys[channel].every(k=>Boolean(process.env[k]));
  }catch{return false;}
}
export function origin(){return validatedPaymentOrigin(env("APP_ORIGIN"));}
