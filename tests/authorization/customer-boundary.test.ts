import { describe, expect, it, vi, beforeEach } from "vitest";
import { CustomersService } from "../../src/modules/customers/customers.service.js";
import { OrdersService } from "../../src/modules/orders/orders.service.js";
import { prisma } from "../../src/shared/utils/prisma.js";
import { AppError } from "../../src/shared/errors/app-error.js";

describe("Customer Authorization & Boundary Isolation Tests (CUS-006, PRIV-005)", () => {
  let customersService: CustomersService;
  let ordersService: OrdersService;

  beforeEach(() => {
    vi.restoreAllMocks();
    customersService = new CustomersService();
    ordersService = new OrdersService();
  });

  it("prevents Customer A from updating Customer B's address (404/403)", async () => {
    // User A has Customer A
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-A",
      accountId: "user-A",
    } as any);

    // Address belongs to Customer B, so looking for (addressId: addr-B, customerId: cust-A) yields null
    vi.spyOn(prisma.customerAddress, "findFirst").mockResolvedValue(null);

    await expect(
      customersService.updateMyAddress("user-A", "addr-B", { label: "Hacked" }, {}),
    ).rejects.toThrow(AppError);
  });

  it("prevents Customer A from deleting Customer B's address", async () => {
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-A",
      accountId: "user-A",
    } as any);

    vi.spyOn(prisma.customerAddress, "findFirst").mockResolvedValue(null);

    await expect(
      customersService.deleteMyAddress("user-A", "addr-B", {}),
    ).rejects.toThrow(AppError);
  });

  it("prevents Customer A from cancelling Customer B's order (403 Forbidden)", async () => {
    const orderB = {
      id: "order-B",
      orderNumber: "ORD-B-100",
      customerId: "cust-B",
      status: "Pending",
    };

    vi.spyOn(prisma.deliveryOrder, "findUnique").mockResolvedValue(orderB as any);
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-A",
      accountId: "user-A",
    } as any);

    await expect(
      ordersService.cancel(
        "order-B",
        { reasonCode: "CUSTOMER_CANCELLED" },
        "user-A",
        {},
        { userId: "user-A", roles: ["customer"] },
      ),
    ).rejects.toThrow(AppError);
  });

  it("allows Customer A to cancel their own order in Pending or ReadyForPickup state", async () => {
    const orderA = {
      id: "order-A",
      orderNumber: "ORD-A-100",
      customerId: "cust-A",
      status: "ReadyForPickup",
    };

    vi.spyOn(prisma.deliveryOrder, "findUnique").mockResolvedValue(orderA as any);
    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue({
      id: "cust-A",
      accountId: "user-A",
    } as any);

    vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
      return cb({
        deliveryAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn(),
        },
        deliveryOrder: {
          update: vi.fn().mockResolvedValue({ ...orderA, status: "Cancelled", version: 2 }),
        },
        deliveryStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-1" }),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: "evt-1" }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: "aud-1" }),
        },
      });
    });

    const cancelled = await ordersService.cancel(
      "order-A",
      { reasonCode: "CUSTOMER_CANCELLED", reasonText: "Changed mind" },
      "user-A",
      { requestId: "req-cancel" },
      { userId: "user-A", roles: ["customer"] },
    );

    expect(cancelled.status).toBe("Cancelled");
  });
});
