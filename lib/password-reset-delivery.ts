import {mailDeliveryConfigured} from "./email-verification-delivery";
import {validVerificationToken} from "./email-verification-policy";

type DeliveryConfig=Record<string,string|undefined>;
type MailTransport=(url:string,init?:RequestInit)=>Promise<Pick<Response,"ok">>;
const destination="https://api.resend.com/emails";
const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/;

export function passwordResetDeliveryConfigured(env:DeliveryConfig):boolean{
 if(env.ENABLE_PASSWORD_RESET_DELIVERY!=="true")return false;
 return mailDeliveryConfigured({...env,ENABLE_EMAIL_VERIFICATION_DELIVERY:"true"});
}

/** Never sends unless the independent reset-mail approval is explicitly enabled. */
export async function sendPasswordResetEmail(
 recipient:string,candidate:unknown,env:DeliveryConfig=process.env,send:MailTransport=fetch
):Promise<boolean>{
 if(!passwordResetDeliveryConfigured(env)||!emailPattern.test(recipient)||
    !validVerificationToken(candidate))return false;
 const link=new URL("/reset-password",env.APP_PUBLIC_BASE_URL);
 link.searchParams.set("token",candidate);
 try{
  const response=await send(destination,{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),
   headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({
    from:env.EMAIL_FROM_ADDRESS,
    to:[recipient],
    subject:"职讯集找回密码",
    text:"如果你发起了密码重置，请打开链接并主动确认新密码。有效期 30 分钟。\n"+link.toString()
   })
  });
  return response.ok;
 }catch{return false;}
}
