import "server-only";
export type Channel="ALIPAY"|"WECHAT";
export function env(name:string){const value=process.env[name];if(!value)throw new Error("Missing payment configuration: "+name);return value.replace(/\\n/g,"\n");}
const keys={ALIPAY:["ALIPAY_APP_ID","ALIPAY_SELLER_ID","ALIPAY_PRIVATE_KEY","ALIPAY_PUBLIC_KEY"],WECHAT:["WECHAT_APP_ID","WECHAT_MCH_ID","WECHAT_MERCHANT_SERIAL","WECHAT_PRIVATE_KEY","WECHAT_PAY_PUBLIC_KEY_ID","WECHAT_PAY_PUBLIC_KEY","WECHAT_API_V3_KEY"]};
export function enabled(channel:Channel){try{return process.env.ENABLE_REAL_PAYMENT==="true"&&new URL(env("APP_ORIGIN")).protocol==="https:"&&keys[channel].every(k=>Boolean(process.env[k]));}catch{return false;}}
export function origin(){const url=new URL(env("APP_ORIGIN"));if(url.protocol!=="https:"||url.pathname!=="/"||url.search||url.hash||url.username||url.password)throw new Error("APP_ORIGIN must be a public HTTPS origin");return url.origin;}
