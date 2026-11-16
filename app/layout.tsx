import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import "./globals.css";
export const metadata: Metadata = { title: "职讯集 | 发现更好的工作机会", description: "精选招聘信息与行业机会" };
export default async function Layout({children}: Readonly<{children: React.ReactNode}>) {
 const user = await currentUser();
 return <html lang="zh-CN"><body><header><nav className="nav wrap"><Link className="brand" href="/">职讯集<span>.</span></Link><div className="links"><Link href="/">招聘首页</Link>{user ? <><Link href="/account">我的订单</Link>{user.role==="ADMIN" && <Link href="/admin">管理后台</Link>}<form action={logout}><button className="quiet">退出</button></form></> : <Link className="button" href="/login">登录 / 注册</Link>}</div></nav></header><main className="wrap">{children}</main><footer className="wrap">职讯集 · 招聘信息仅供参考，请核实招聘方身份，警惕求职诈骗。</footer></body></html>;
}