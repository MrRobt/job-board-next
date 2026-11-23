import Link from "next/link";
import {register} from "@/app/actions/auth";
export default async function Register({searchParams}:{searchParams:Promise<{error?:string;pending?:string}>}){
 const {error,pending}=await searchParams;
 return <section className="card form top">
  <h1>注册账号</h1>
  {error&&<p className="error">注册尚未完成，请检查信息或邮件服务配置。已有账号可在验证页面重新申请邮件。</p>}
  {pending&&<p>注册成功，请查收验证邮件并点击确认后再登录。</p>}
  <form action={register}>
   <label htmlFor="email">邮箱</label>
   <input id="email" name="email" type="email" autoComplete="email" required/>
   <label htmlFor="password">密码（至少 12 位）</label>
   <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/>
   <button>注册并发送验证邮件</button>
  </form>
  <p><Link href="/verify-email">重新发送验证邮件</Link> · <Link href="/login">已有账号，登录</Link></p>
 </section>;
}
