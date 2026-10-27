import { prisma } from "./src/shared/utils/prisma.js";
async function main() {
  const users = await prisma.user.findMany({
    where: { status: "Invited" },
    select: { id: true, email: true, status: true, invitationTokenHash: true, invitationExpiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
