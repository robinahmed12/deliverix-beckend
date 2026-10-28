import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

async function run() {
  const users = await prisma.user.findMany({
    include: { roles: { include: { role: true } }, driver: true }
  });
  console.log(JSON.stringify(users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    roles: u.roles.map(r => r.role.name),
    hasDriver: !!u.driver,
    driverCode: u.driver?.driverCode,
    driverId: u.driver?.id
  })), null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
