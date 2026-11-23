import Link from "next/link";
import {login} from "@/app/actions/auth";
export default async function Login({searchParams}:{searchParams:Promise<{error?:string;pending?:string;verified?:string}>}){
 const {error,pending,verified}=await searchParams;
 return <section className="card form top">
  <h1>登录职讯集</h1>
  {error&&<p className="error">邮箱或密码不正确。</p>}
  {pending&&<p className="error">邮箱尚未验证。请打开验证邮件中的链接，或<Link href="/verify-email">重新申请验证邮件</Link>。</p>}
  {verified&&<p>邮箱验证成功，请登录。</p>}
  <form action={login}>
   <label htmlFor="email">邮箱</label>
   <input id="email" name="email" type="email" autoComplete="email" required/>
   <label htmlFor="password">密码</label>
   <input id="password" name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required/>
   <button>登录</button>
  </form>
  <p>还没有账号？ <Link href="/register">注册</Link></p>
 </section>;
}
