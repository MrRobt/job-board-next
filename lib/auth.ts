import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
const cookieName = "job_session";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: digest(token) }, select: { expiresAt: true, user: { select: { id: true, email: true, role: true, emailVerifiedAt: true } } } });
  if (!session || session.expiresAt <= new Date() || !session.user.emailVerifiedAt) return null;
  return {id:session.user.id,email:session.user.email,role:session.user.role};
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
export async function startSession(userId: string) {
  const eligible = await db.user.findUnique({where:{id:userId},select:{emailVerifiedAt:true}});
  if (!eligible?.emailVerifiedAt) throw new Error("Email verification required");
  const jar = await cookies();
  const old = jar.get(cookieName)?.value;
  if (old) await db.session.deleteMany({ where: { tokenHash: digest(old) } });
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({ data: { tokenHash: digest(token), userId, expiresAt } });
  jar.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: digest(token) } });
  jar.delete(cookieName);
}
