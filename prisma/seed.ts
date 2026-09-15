import "dotenv/config";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

const PERMISSIONS = [
  "users.manage",
  "users.view",
  "roles.manage",
  "customers.manage",
  "customers.view",
  "drivers.manage",
  "drivers.view",
  "vehicles.view",
  "vehicles.manage",
  "zones.view",
  "zones.manage",
  "service-types.manage",
  "orders.create",
  "orders.view",
  "orders.edit",
  "orders.cancel",
  "orders.internal-notes",
  "dispatch.assign",
  "dispatch.reassign",
  "dispatch.view-queue",
  "deliveries.execute",
  "proof.submit",
  "proof.view",
  "returns.manage",
  "notifications.view",
  "reports.view",
  "audit.view",
  "config.manage",
] as const;

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  admin: PERMISSIONS,
  dispatcher: [
    "customers.view",
    "drivers.view",
    "vehicles.view",
    "zones.view",
    "orders.create",
    "orders.view",
    "orders.edit",
    "orders.cancel",
    "orders.internal-notes",
    "dispatch.assign",
    "dispatch.reassign",
    "dispatch.view-queue",
    "proof.view",
    "returns.manage",
    "reports.view",
    "notifications.view",
  ],
  driver: [
    "deliveries.execute",
    "proof.submit",
    "proof.view",
    "notifications.view",
  ],
  customer: ["orders.view"],
  support: [
    "customers.view",
    "orders.view",
    "orders.edit",
    "orders.cancel",
    "orders.internal-notes",
    "returns.manage",
    "reports.view",
    "notifications.view",
  ],
};

async function seedPermissions() {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }
}

async function seedRoles() {
  for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} role` },
    });
    for (const code of codes) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
}

async function seedAdmin() {
  const email = "admin@deliverix.local";
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return;
  }
  const passwordHash = await argon2.hash("Deliverix-Admin-1", {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "System Admin",
      status: "Active",
      roles: { create: { roleId: adminRole.id } },
    },
  });
  void user;
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());