import { prisma } from "../../shared/utils/prisma.js";

export class RolesService {
  async list(userId?: string) {
    const where = userId ? { users: { some: { userId } } } : {};

    const roles = await prisma.role.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { code: "asc" } },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rp) => rp.permission.code),
      createdAt: role.createdAt,
    }));
  }
}