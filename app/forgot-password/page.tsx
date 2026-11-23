import Link from "next/link";
import type {Metadata} from "next";
import {requestPasswordReset} from "@/app/actions/password-reset";

export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function ForgotPassword({searchParams}:{searchParams:Promise<{sent?:string}>}){
 const {sent}=await searchParams;
 return <section className="card form top">
  <h1>找回密码</h1>
  {sent&&<p>如果账号存在且已验证邮箱，并已启用邮件服务，我们会发送找回链接。请检查收件箱。</p>}
  <form action={requestPasswordReset}>
   <label htmlFor="reset-email">注册邮箱</label>
   <input name="email" id="reset-email" type="email" autoComplete="email" required/>
   <button>申请找回链接</button>
  </form>
  <p><Link href="/login">返回登录</Link></p>
 </section>;
}
