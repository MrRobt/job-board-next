import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
const db = new PrismaClient();
async function main() {
  for (const name of ["互联网 / IT","人工智能","跨境电商","金融 / 财会","设计 / 创意","制造业","教育 / 培训","其他行业"]) {
    await db.category.upsert({ where: { name }, create: { name }, update: {} });
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password && password.length >= 12) {
    const exists = await db.user.findUnique({ where: { email } });
    if (!exists) await db.user.create({ data: { email, passwordHash: hashPassword(password), role: "ADMIN" } });
    else if (exists.role !== "ADMIN") throw new Error("Existing non-admin account; refusing privilege escalation");
  } else console.info("Set ADMIN_EMAIL and ADMIN_PASSWORD (>=12 chars) to initialize admin.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
