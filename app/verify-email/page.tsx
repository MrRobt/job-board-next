import Link from "next/link";
import type {Metadata} from "next";
import {confirmEmailVerification,resendEmailVerification} from "@/app/actions/email-verification";
import {validVerificationToken} from "@/lib/email-verification-policy";

export const metadata:Metadata={robots:{index:false,follow:false}};

export default async function VerifyEmail({
 searchParams
}:{searchParams:Promise<{token?:string;error?:string;resent?:string}>}){
 const {token,error,resent}=await searchParams;
 const eligible=validVerificationToken(token);
 return <section className="card form top">
  <meta name="referrer" content="no-referrer"/>
  <h1>验证邮箱</h1>
  {error&&<p className="error">验证链接无效、已使用或已过期，请重新申请验证邮件。</p>}
  {resent&&<p>如果账号存在、尚未验证且邮件服务已启用，我们会发送验证邮件。请检查收件箱。</p>}
  {eligible?<form action={confirmEmailVerification}>
   <p>请主动点击确认按钮完成邮箱验证。此页面不会在打开时自动使用链接。</p>
   <input type="hidden" name="token" value={token}/>
   <button>确认邮箱</button>
  </form>:<p>请输入注册邮箱以重新申请验证链接。</p>}
  <form action={resendEmailVerification}>
   <label htmlFor="verification-email">注册邮箱</label>
   <input id="verification-email" name="email" type="email" autoComplete="email" required/>
   <button>重新发送验证邮件</button>
  </form>
  <p><Link href="/login">返回登录</Link></p>
 </section>;
}
