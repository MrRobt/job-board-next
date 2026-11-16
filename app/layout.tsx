import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import "./globals.css";
export const dynamic="force-dynamic";
export const metadata: Metadata = { title: "职讯集 | AI 求职工具箱", description: "自主简历诊断、模拟面试与个人求职管理" };
export default async function Layout({children}: Readonly<{children: React.ReactNode}>) {
 const user = await currentUser();
 return <html lang="zh-CN"><body><header><nav className="nav wrap"><Link className="brand" href="/">职讯集<span>.</span></Link><div className="links"><Link href="/tools/resume">简历诊断</Link><Link href="/tools/interview">模拟面试</Link><Link href="/tracker">求职管理</Link><Link href="/pricing">服务价格</Link>{user ? <><Link href="/account">我的账户</Link>{user.role==="ADMIN" && <Link href="/admin">管理后台</Link>}<form action={logout}><button className="quiet">退出</button></form></> : <Link className="button" href="/login">登录 / 注册</Link>}</div></nav></header><main className="wrap">{children}</main><footer className="wrap">职讯集 · 独立求职效率工具，不提供职业介绍或录用承诺。 <Link href="/about">平台说明与安全提示</Link></footer></body></html>;
}