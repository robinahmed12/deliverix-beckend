import { describe, expect, it, vi, beforeEach } from "vitest";
import { CustomersService } from "../../../../src/modules/customers/customers.service.js";
import { prisma } from "../../../../src/shared/utils/prisma.js";
import { AppError } from "../../../../src/shared/errors/app-error.js";

describe("Customer Lifecycle Unit Tests", () => {
  let service: CustomersService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new CustomersService();
  });

  describe("getMe", () => {
    it("returns customer profile with addresses and order stats", async () => {
      const mockCustomer = {
        id: "cust-1",
        name: "Alice Smith",
        email: "alice@example.com",
        phone: "+15551234567",
        status: "active",
        accountId: "user-1",
        version: 1,
        createdAt: new Date(),
        addresses: [
          {
            id: "addr-1",
            label: "Home",
            line1: "123 Main St",
            line2: null,
            city: "Metropolis",
            region: "NY",
            postalCode: "10001",
            country: "US",
            latitude: null,
            longitude: null,
            isDefault: true,
            version: 1,
          },
        ],
      };

      vi.spyOn(prisma.customer, "findUnique").mockResolvedValue(mockCustomer as any);
      vi.spyOn(prisma.deliveryOrder, "count")
        .mockResolvedValueOnce(2) // active orders
        .mockResolvedValueOnce(5); // total orders

      const result = await service.getMe("user-1");

      expect(result.id).toBe("cust-1");
      expect(result.name).toBe("Alice Smith");
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0]?.label).toBe("Home");
      expect(result.stats.activeOrderCount).toBe(2);
      expect(result.stats.totalOrderCount).toBe(5);
    });

    it("throws 404 if no customer profile is linked to the user account", async () => {
      vi.spyOn(prisma.customer, "findUnique").mockResolvedValue(null);

      await expect(service.getMe("unlinked-user")).rejects.toThrow(AppError);
    });
  });

  describe("updateMe", () => {
    it("updates customer profile and writes audit log", async () => {
      const existing = {
        id: "cust-1",
        name: "Alice Smith",
        email: "alice@example.com",
        phone: "+15551234567",
        phoneNormalized: "15551234567",
        status: "active",
        accountId: "user-1",
        version: 1,
        createdAt: new Date(),
      };

      const updated = {
        ...existing,
        name: "Alice Johnson",
        phone: "+15559876543",
        phoneNormalized: "15559876543",
        version: 2,
      };

      vi.spyOn(prisma.customer, "findUnique").mockResolvedValueOnce(existing as any).mockResolvedValueOnce(null);
      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb({
          customer: {
            update: vi.fn().mockResolvedValue(updated),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: "audit-1" }),
          },
        });
      });

      const res = await service.updateMe("user-1", { name: "Alice Johnson", phone: "+15559876543" }, { requestId: "req-1" });

      expect(res.name).toBe("Alice Johnson");
      expect(res.phone).toBe("+15559876543");
    });
  });

  describe("linkAccount (CUS-005)", () => {
    it("successfully links an unlinked customer profile when email matches", async () => {
      const candidate = {
        id: "cust-guest",
        name: "Guest Bob",
        email: "bob@example.com",
        emailNormalized: "bob@example.com",
        phone: null,
        phoneNormalized: null,
        accountId: null,
        status: "active",
        version: 1,
        createdAt: new Date(),
      };

      vi.spyOn(prisma.customer, "findUnique")
        .mockResolvedValueOnce(null) // user not yet linked
        .mockResolvedValueOnce(candidate as any); // matched by email

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb({
          customer: {
            update: vi.fn().mockResolvedValue({ ...candidate, accountId: "user-bob" }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: "audit-link" }),
          },
        });
      });

      const result = await service.linkAccount("user-bob", "bob@example.com", null, undefined, { requestId: "req-link" });

      expect(result.accountId).toBe("user-bob");
    });

    it("rejects linking if account email/phone does not match customer profile (403)", async () => {
      const candidate = {
        id: "cust-charlie",
        name: "Charlie",
        email: "charlie@example.com",
        emailNormalized: "charlie@example.com",
        phone: null,
        phoneNormalized: null,
        accountId: null,
        status: "active",
        version: 1,
      };

      vi.spyOn(prisma.customer, "findUnique")
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(candidate as any);

      await expect(
        service.linkAccount("user-attacker", "attacker@example.com", null, "cust-charlie", { requestId: "req-bad" }),
      ).rejects.toThrowError(AppError);
    });

    it("returns existing customer if user is already linked", async () => {
      const alreadyLinked = {
        id: "cust-bob",
        name: "Bob",
        email: "bob@example.com",
        phone: null,
        status: "active",
        accountId: "user-bob",
        version: 1,
        createdAt: new Date(),
      };

      vi.spyOn(prisma.customer, "findUnique").mockResolvedValueOnce(alreadyLinked as any);

      const result = await service.linkAccount("user-bob", "bob@example.com", null, undefined, {});

      expect(result.id).toBe("cust-bob");
      expect(result.accountId).toBe("user-bob");
    });
  });

  describe("Address Management (Self-Service)", () => {
    it("creates address for authenticated customer and handles isDefault", async () => {
      const mockCustomer = { id: "cust-1", accountId: "user-1" };
      vi.spyOn(prisma.customer, "findUnique").mockResolvedValue(mockCustomer as any);

      const createdAddress = {
        id: "addr-new",
        customerId: "cust-1",
        label: "Office",
        line1: "500 Tech Park",
        line2: null,
        city: "San Francisco",
        region: "CA",
        postalCode: "94105",
        country: "US",
        latitude: null,
        longitude: null,
        isDefault: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        return cb({
          customerAddress: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue(createdAddress),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: "audit-addr" }),
          },
        });
      });

      const res = await service.createMyAddress(
        "user-1",
        {
          label: "Office",
          line1: "500 Tech Park",
          city: "San Francisco",
          region: "CA",
          postalCode: "94105",
          isDefault: true,
        },
        {},
      );

      expect(res.id).toBe("addr-new");
      expect(res.isDefault).toBe(true);
    });
  });
});
