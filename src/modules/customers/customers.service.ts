import { prisma } from "../../shared/utils/prisma.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";

function normalizeEmail(email?: string): string | null {
  return email ? email.trim().toLowerCase() : null;
}

function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function toCustomerDto(c: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  version: number;
  createdAt: Date;
  accountId: string | null;
}) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    status: c.status,
    accountId: c.accountId,
    version: c.version,
    createdAt: c.createdAt,
  };
}

export class CustomersService {
  async list(params: { page: number; pageSize: number; search?: string; status?: string }) {
    const where: Record<string, unknown> = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { emailNormalized: { contains: params.search.toLowerCase(), mode: "insensitive" } },
      ];
    }
    if (params.status) {
      where.status = params.status;
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      data: customers.map(toCustomerDto),
      meta: { page: params.page, pageSize: params.pageSize, total, totalPages: Math.ceil(total / params.pageSize) },
    };
  }

  async getById(id: string) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Customer not found");
    }
    return toCustomerDto(customer);
  }

  async create(
    data: { name: string; email?: string; phone?: string },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const emailNormalized = normalizeEmail(data.email);
    const phoneNormalized = normalizePhone(data.phone);

    if (emailNormalized) {
      const exists = await prisma.customer.findUnique({ where: { emailNormalized } });
      if (exists) {
        throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "A customer with this email already exists");
      }
    }
    if (phoneNormalized) {
      const exists = await prisma.customer.findUnique({ where: { phoneNormalized } });
      if (exists) {
        throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "A customer with this phone already exists");
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          name: data.name,
          email: data.email ?? null,
          emailNormalized,
          phone: data.phone ?? null,
          phoneNormalized,
          status: "active",
        },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "customer.created",
          resourceType: "customer",
          resourceId: created.id,
          after: { name: created.name, email: created.email, phone: created.phone },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return created;
    });

    return toCustomerDto(customer);
  }

  async update(
    id: string,
    data: { name?: string; email?: string | null; phone?: string | null; status?: string; version?: number },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const before = await prisma.customer.findUnique({ where: { id } });
    if (!before) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Customer not found");
    }

    if (data.version !== undefined && data.version !== before.version) {
      throw new AppError(412, ErrorCodes.RESOURCE_VERSION_MISMATCH, "Resource version mismatch");
    }

    const emailNormalized = normalizeEmail(data.email ?? undefined);
    const phoneNormalized = normalizePhone(data.phone ?? undefined);

    const updateData: {
      name?: string;
      email?: string | null;
      emailNormalized?: string | null;
      phone?: string | null;
      phoneNormalized?: string | null;
      status?: string;
      version?: { increment: number };
    } = { version: { increment: 1 } };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) {
      updateData.email = data.email;
      if (emailNormalized) updateData.emailNormalized = emailNormalized;
      else updateData.emailNormalized = null;
    }
    if (data.phone !== undefined) {
      updateData.phone = data.phone;
      if (phoneNormalized) updateData.phoneNormalized = phoneNormalized;
      else updateData.phoneNormalized = null;
    }
    if (data.status !== undefined) updateData.status = data.status;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.customer.update({ where: { id }, data: updateData });

        await writeAudit(
          {
            actorId,
            actorType: "user",
            action: "customer.updated",
            resourceType: "customer",
            resourceId: id,
            before: { name: before.name, email: before.email, phone: before.phone, status: before.status },
            after: {
              name: data.name ?? before.name,
              email: data.email === undefined ? before.email : data.email,
              phone: data.phone === undefined ? before.phone : data.phone,
              status: data.status ?? before.status,
            },
            requestId: meta.requestId ?? null,
            ip: meta.ip ?? null,
          },
          tx,
        );

        return result;
      });

      return toCustomerDto(updated);
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
        throw new AppError(409, ErrorCodes.VALIDATION_FAILED, "Email or phone already in use by another customer");
      }
      throw err;
    }
  }

  async listAddresses(customerId: string) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Customer not found");
    }

    const addresses = await prisma.customerAddress.findMany({
      where: { customerId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return addresses.map((a) => ({
      id: a.id,
      label: a.label,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      region: a.region,
      postalCode: a.postalCode,
      country: a.country,
      latitude: a.latitude,
      longitude: a.longitude,
      isDefault: a.isDefault,
      version: a.version,
    }));
  }

  async createAddress(
    customerId: string,
    data: {
      label?: string;
      line1: string;
      line2?: string | null;
      city: string;
      region?: string | null;
      postalCode?: string | null;
      country?: string;
      latitude?: number | null;
      longitude?: number | null;
      isDefault?: boolean;
    },
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Customer not found");
    }

    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId, deletedAt: null },
          data: { isDefault: false },
        });
      }
      const created = await tx.customerAddress.create({
        data: {
          customerId,
          label: data.label ?? null,
          line1: data.line1,
          line2: data.line2 ?? null,
          city: data.city,
          region: data.region ?? null,
          postalCode: data.postalCode ?? null,
          country: data.country ?? "US",
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          isDefault: data.isDefault ?? false,
        },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "customer.address_created",
          resourceType: "customerAddress",
          resourceId: created.id,
          after: { customerId, line1: created.line1, city: created.city },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return created;
    });

    return {
      id: address.id,
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      latitude: address.latitude,
      longitude: address.longitude,
      isDefault: address.isDefault,
      version: address.version,
    };
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    data: Partial<{
      label: string;
      line1: string;
      line2: string | null;
      city: string;
      region: string | null;
      postalCode: string | null;
      country: string;
      latitude: number | null;
      longitude: number | null;
      isDefault: boolean;
    }>,
    actorId: string,
    meta: { requestId?: string; ip?: string },
  ) {
    const address = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerId, deletedAt: null },
    });
    if (!address) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Address not found");
    }

    const updateData = { ...data, version: { increment: 1 } };
    delete (updateData as { version?: unknown }).version;

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId, deletedAt: null, id: { not: addressId } },
          data: { isDefault: false },
        });
      }

      const result = await tx.customerAddress.update({
        where: { id: addressId },
        data: { ...data, version: { increment: 1 } },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "customer.address_updated",
          resourceType: "customerAddress",
          resourceId: addressId,
          before: { line1: address.line1, city: address.city },
          after: { line1: result.line1, city: result.city },
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );

      return result;
    });

    return {
      id: updated.id,
      label: updated.label,
      line1: updated.line1,
      line2: updated.line2,
      city: updated.city,
      region: updated.region,
      postalCode: updated.postalCode,
      country: updated.country,
      latitude: updated.latitude,
      longitude: updated.longitude,
      isDefault: updated.isDefault,
      version: updated.version,
    };
  }

  async deleteAddress(customerId: string, addressId: string, actorId: string, meta: { requestId?: string; ip?: string }) {
    const address = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerId, deletedAt: null },
    });
    if (!address) {
      throw new AppError(404, ErrorCodes.RESOURCE_NOT_FOUND, "Address not found");
    }

    await prisma.$transaction(async (tx) => {
      await tx.customerAddress.update({
        where: { id: addressId },
        data: { deletedAt: new Date() },
      });

      await writeAudit(
        {
          actorId,
          actorType: "user",
          action: "customer.address_deleted",
          resourceType: "customerAddress",
          resourceId: addressId,
          reason: "soft-delete",
          requestId: meta.requestId ?? null,
          ip: meta.ip ?? null,
        },
        tx,
      );
    });
  }
}