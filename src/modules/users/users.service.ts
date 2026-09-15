import { prisma } from "../../shared/utils/prisma.js";
import { generateSecureToken } from "../../shared/utils/crypto.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { env } from "../../config/env.js";
import { TOKEN } from "../../config/constants.js";
import { nodemailerAdapter } from "../../integrations/email/nodemailer.adapter.js";
import { invitationEmail } from "../../integrations/email/templates/invitation.js";

function toSafeDto(user: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  mfaEnabled: boolean;
  version: number;
  createdAt: Date;
  roles: Array<{ role: { name: string } }>;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    roles: user.roles.map((ur) => ur.role.name),
    version: user.version,
    createdAt: user.createdAt,
  };
}

interface RoleRelation {
  roles: Array<{ role: { name: string } }>;
}

export class UsersService {
  async list(params: { page: number; pageSize: number; status?: string; role?: string; search?: string }) {
    const where: Record<string, unknown> = {};

    if (params.status !== undefined) {
      where.status = params.status;
    }
    if (params.role !== undefined) {
      where.roles = { some: { role: { name: params.role } } };
    }
    if (params.search !== undefined && params.search !== "") {
      where.OR = [
        { email: { contains: params.search, mode: "insensitive" } },
        { name: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: "asc" },
        include: { roles: { include: { role: true } } },
      }),
    ]);

    return {
      data: users.map((u) => toSafeDto(u as unknown as RoleRelation & typeof u)),
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
    };
  }

  async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "User not found");
    }
    return toSafeDto(user as unknown as RoleRelation & typeof user);
  }

  async create(
    data: { email: string; name: string; roleIds: string[]; phone?: string },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "User with this email already exists");
    }

    const roles = await prisma.role.findMany({ where: { id: { in: data.roleIds } } });
    const foundIds = new Set(roles.map((r) => r.id));
    if (roles.length !== data.roleIds.length || !data.roleIds.every((id) => foundIds.has(id))) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "One or more roles do not exist");
    }

    const invitationToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + TOKEN.INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);
    const placeholderHash = generateSecureToken(48);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          name: data.name,
          phone: data.phone ?? null,
          passwordHash: placeholderHash,
          status: "Invited",
          invitationTokenHash: invitationToken,
          invitationExpiresAt: expiresAt,
          roles: {
            create: data.roleIds.map((roleId) => ({ roleId })),
          },
        },
        include: { roles: { include: { role: true } } },
      });

      await writeAudit(
        {
          actorId: actorId,
          actorType: "user",
          action: "user.invited",
          resourceType: "user",
          resourceId: created.id,
          after: { email: created.email, roleIds: data.roleIds },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return created;
    });

    const origin = env.CORS_ORIGINS.split(",")[0]?.trim() ?? "";
    const invitationUrl = `${origin}/accept-invitation?token=${invitationToken}`;
    const email = invitationEmail({
      inviterName: "Deliverix Admin",
      organizationName: "Deliverix",
      invitationUrl,
      expiresIn: `${TOKEN.INVITATION_EXPIRY_HOURS} hours`,
    });
    await nodemailerAdapter.send({
      to: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    return toSafeDto(user as unknown as RoleRelation & typeof user);
  }

  async update(
    id: string,
    data: { name?: string; phone?: string | null; status?: string; version?: number },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const before = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!before) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "User not found");
    }

    if (
      data.status &&
      ["Suspended", "Inactive"].includes(data.status) &&
      id === actorId
    ) {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "You cannot deactivate your own account");
    }

    if (data.version !== undefined && data.version !== before.version) {
      throw new AppError(412, ErrorCodes.RESOURCE_VERSION_MISMATCH, "Resource version mismatch");
    }

    const updateData: {
      name?: string;
      phone?: string | null;
      status?: "Active" | "Inactive" | "Suspended" | "Invited";
      version?: { increment: number };
    } = {
      version: { increment: 1 },
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone ?? null;
    if (data.status !== undefined) {
      updateData.status = data.status as "Active" | "Inactive" | "Suspended";
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: updateData,
        include: { roles: { include: { role: true } } },
}); 

      await writeAudit(
        {
          actorId: actorId,
          actorType: "user",
          action: "user.updated",
          resourceType: "user",
          resourceId: id,
          before: { name: before.name, phone: before.phone as string | null, status: before.status },
          after: { name: data.name ?? before.name, phone: data.phone ?? before.phone, status: data.status ?? before.status },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return result;
    });

    return toSafeDto(updated as unknown as RoleRelation & typeof updated);
  }

  async replaceRoles(
    id: string,
    roleIds: string[],
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const user = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!user) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "User not found");
    }

    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "One or more roles do not exist");
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
      });

      await writeAudit(
        {
          actorId: actorId,
          actorType: "user",
          action: "user.roles_replaced",
          resourceType: "user",
          resourceId: id,
          before: { roleIds: user.roles.map((r) => r.roleId) },
          after: { roleIds },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );
    });

    return this.getById(id);
  }
}