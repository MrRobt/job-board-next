import Link from "next/link";
import type {Metadata} from "next";
import {confirmPasswordReset} from "@/app/actions/password-reset";
import {validVerificationToken} from "@/lib/email-verification-policy";

export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function ResetPassword({searchParams}:{searchParams:Promise<{token?:string;error?:string}>}){
 const {token,error}=await searchParams;
 const eligible=validVerificationToken(token);
 return <section className="card form top">
  <meta name="referrer" content="no-referrer"/>
  <h1>重设密码</h1>
  {error&&<p className="error">链接已失效或请求未完成，请重新申请。</p>}
  {eligible?<form action={confirmPasswordReset}>
   <p>请在下方输入新密码并确认。仅打开链接不会改变密码。</p>
   <input type="hidden" name="token" value={token}/>
   <label htmlFor="new-password">新密码（12 至 128 位）</label>
   <input id="new-password" type="password" name="newPassword" minLength={12} maxLength={128} autoComplete="new-password" required/>
   <button>确认重设密码</button>
  </form>:<p>链接无效。请重新申请找回密码。</p>}
  <p><Link href="/forgot-password">重新申请链接</Link> · <Link href="/login">返回登录</Link></p>
 </section>;
}
