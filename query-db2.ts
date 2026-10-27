import { prisma } from "./src/shared/utils/prisma.js";
async function main() {
  const token = "DlJHbqjhZdC976XXuEKF8YAsMmd-aFDOrdXQCosFa4s";
  const active = await prisma.user.findMany({
    where: { status: "Active" },
    select: { id: true, email: true, name: true, status: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  console.log("RECENT ACTIVE USERS:", JSON.stringify(active, null, 2));
  // search audit logs for accept-invitation / user.invited with the token
  const logs = await prisma.auditLog.findMany({
    where: { action: { in: ["user.invited", "auth.accept-invitation"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, resourceId: true, createdAt: true, metadata: true },
  });
  console.log("AUDIT:", JSON.stringify(logs, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
