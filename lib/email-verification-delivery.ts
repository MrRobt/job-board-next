import {validVerificationToken} from "./email-verification-policy";

type MailEnvironment=Record<string,string|undefined>;
type MailTransport=(url:string,init?:RequestInit)=>Promise<Pick<Response,"ok">>;

const simpleEmail=/^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/;
const endpoint="https://api.resend.com/emails";

/** Delivery is opt-in and cannot be activated without an approved HTTPS origin. */
export function mailDeliveryConfigured(env:MailEnvironment):boolean{
 if(env.ENABLE_EMAIL_VERIFICATION_DELIVERY!=="true")return false;
 if(!env.RESEND_API_KEY||!env.RESEND_API_KEY.trim()||!env.EMAIL_FROM_ADDRESS||
  !simpleEmail.test(env.EMAIL_FROM_ADDRESS))return false;
 try{
  const base=new URL(env.APP_PUBLIC_BASE_URL??"");
  return base.protocol==="https:"&&!!base.hostname&&!base.username&&!base.password&&
   (base.pathname==="/"||base.pathname==="")&&!base.search&&!base.hash;
 }catch{return false;}
}

/** Network I/O only when explicit delivery approval and all inputs are valid. */
export async function sendVerificationEmail(
 recipient:string,candidate:unknown,env:MailEnvironment=process.env,transport:MailTransport=fetch
):Promise<boolean>{
 if(!mailDeliveryConfigured(env)||!simpleEmail.test(recipient)||!validVerificationToken(candidate))return false;
 const link=new URL("/verify-email",env.APP_PUBLIC_BASE_URL);
 link.searchParams.set("token",candidate);
 try{
  const response=await transport(endpoint,{
   method:"POST",
   headers:{
    "Authorization":"Bearer "+env.RESEND_API_KEY,
    "Content-Type":"application/json"
   },
   body:JSON.stringify({
    from:env.EMAIL_FROM_ADDRESS,
    to:[recipient],
    subject:"职讯集邮箱验证",
    text:"请打开以下链接并主动点击确认按钮以验证邮箱。链接有效期为 24 小时。\n"+link.toString()
   }),
   redirect:"error",
   signal:AbortSignal.timeout(8000)
  });
  return response.ok;
 }catch{return false;}
}
