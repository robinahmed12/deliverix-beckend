import { prisma } from "./src/shared/utils/prisma.js";
async function main() {
  const token = "DlJHbqjhZdC976XXuEKF8YAsMmd-aFDOrdXQCosFa4s";
  const users = await prisma.user.findMany({
    where: { status: "Invited" },
    select: { id: true, email: true, status: true, invitationTokenHash: true, invitationExpiresAt: true },
  });
  console.log("INVITED USERS:", JSON.stringify(users, null, 2));
  const exact = await prisma.user.findFirst({ where: { invitationTokenHash: token } });
  console.log("EXACT TOKEN MATCH:", JSON.stringify(exact, null, 2));
  const expired = await prisma.user.findMany({ where: { invitationExpiresAt: { lt: new Date() } }, select: { email: true, status: true, invitationExpiresAt: true } });
  console.log("EXPIRED INVITES:", JSON.stringify(expired));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
