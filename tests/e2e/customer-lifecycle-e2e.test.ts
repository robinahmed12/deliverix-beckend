import { describe, expect, it, vi } from "vitest";
import { CustomersService } from "../../src/modules/customers/customers.service.js";
import { OrdersService } from "../../src/modules/orders/orders.service.js";
import { CustomerContextService } from "../../src/modules/customers/customer-context.service.js";
import { prisma } from "../../src/shared/utils/prisma.js";

describe("Phase 6 & 7: Customer Lifecycle End-to-End Flow (E2E)", () => {
  const customersService = new CustomersService();
  const ordersService = new OrdersService();
  const customerContextService = new CustomerContextService();

  it("completes full customer lifecycle from guest checkout to account linking, address management, order cancellation, and RAG context generation", async () => {
    // 1. Initial State: Guest customer profile exists with an active order
    const guestCustomer: any = {
      id: "cust-elena-101",
      name: "Elena Rostova",
      email: "elena@example.com",
      emailNormalized: "elena@example.com",
      phone: "+15554443333",
      phoneNormalized: "15554443333",
      accountId: null,
      status: "active",
      version: 1,
      createdAt: new Date(),
    };

    const guestOrder: any = {
      id: "order-elena-01",
      orderNumber: "ORD-ELENA-2026",
      customerId: "cust-elena-101",
      status: "ReadyForPickup",
      pickupAddress: { line1: "Central Hub" },
      deliveryAddress: { line1: "123 Orchard Road" },
      promisedAtStart: new Date("2026-11-05T12:00:00Z"),
      promisedAtEnd: new Date("2026-11-05T16:00:00Z"),
      deliveryFee: { toString: () => "12.50" },
      currencyCode: "USD",
      items: [{ name: "Organic Grocery Basket", quantity: 1, description: "Fresh produce" }],
      attempts: [],
      statusHistory: [
        {
          toStatus: "ReadyForPickup",
          reasonCode: "ORDER_READY",
          createdAt: new Date("2026-11-05T11:00:00Z"),
        },
      ],
    };

    let linkedCustomer: any = { ...guestCustomer };
    const savedAddresses: any[] = [];

    // 2. Account Linking (CUS-005): Elena signs up (user-elena) with matching email and links her profile
    vi.spyOn(prisma.customer, "findUnique").mockImplementation(async ({ where }: any) => {
      if (where.accountId === "user-elena") {
        return linkedCustomer.accountId ? linkedCustomer : null;
      }
      if (where.id === "cust-elena-101") {
        return linkedCustomer;
      }
      if (where.emailNormalized === "elena@example.com") {
        return linkedCustomer;
      }
      return null;
    });

    vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
      return cb({
        customer: {
          update: vi.fn().mockImplementation(({ data }: any) => {
            linkedCustomer = { ...linkedCustomer, ...data };
            return Promise.resolve(linkedCustomer);
          }),
        },
        customerAddress: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockImplementation(({ data }: any) => {
            const addr = { id: `addr-${savedAddresses.length + 1}`, ...data, version: 1 };
            savedAddresses.push(addr);
            return Promise.resolve(addr);
          }),
        },
        deliveryAssignment: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn(),
        },
        deliveryOrder: {
          update: vi.fn().mockImplementation(({ data }: any) => {
            guestOrder.status = data.status;
            return Promise.resolve(guestOrder);
          }),
        },
        deliveryStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-cancel" }),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: "evt-cancel" }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
      });
    });

    // Execute Link
    const linkResult = await customersService.linkAccount(
      "user-elena",
      "elena@example.com",
      "+15554443333",
      undefined,
      { requestId: "req-e2e-link" },
    );
    expect(linkResult.accountId).toBe("user-elena");

    // 3. Address Addition: Elena saves her home address
    const newAddress = await customersService.createMyAddress(
      "user-elena",
      {
        label: "Home",
        line1: "123 Orchard Road",
        city: "Austin",
        region: "TX",
        postalCode: "78701",
        isDefault: true,
      },
      { requestId: "req-e2e-addr" },
    );
    expect(newAddress.label).toBe("Home");
    expect(newAddress.city).toBe("Austin");

    // 4. Order Cancellation: Elena cancels her order before pickup
    vi.spyOn(prisma.deliveryOrder, "findUnique").mockResolvedValue(guestOrder);

    const cancelResult = await ordersService.cancel(
      "order-elena-01",
      { reasonCode: "CUSTOMER_CANCELLED", reasonText: "Order placed by mistake" },
      "user-elena",
      { requestId: "req-e2e-cancel" },
      { userId: "user-elena", roles: ["customer"] },
    );
    expect(cancelResult.status).toBe("Cancelled");

    // 5. RAG Context Aggregation: LangChain RAG pipeline requests customer grounding context
    linkedCustomer.addresses = savedAddresses;
    vi.spyOn(prisma.deliveryOrder, "findMany")
      .mockResolvedValueOnce([]) // No active orders (since it was cancelled)
      .mockResolvedValueOnce([
        {
          id: guestOrder.id,
          orderNumber: guestOrder.orderNumber,
          status: "Cancelled",
          deliveredAt: null,
          cancelledAt: new Date(),
          returnedAt: null,
        },
      ]);

    const ragContext = await customerContextService.buildCustomerContext("user-elena");
    expect(ragContext.customer.name).toBe("Elena Rostova");
    expect(ragContext.savedAddresses).toHaveLength(1);
    expect(ragContext.activeOrders).toHaveLength(0);
    expect(ragContext.recentCompletedOrders).toHaveLength(1);
    expect(ragContext.recentCompletedOrders[0]?.orderNumber).toBe("ORD-ELENA-2026");

    const promptText = customerContextService.formatContextForPrompt(ragContext);
    expect(promptText).toContain("Elena Rostova");
    expect(promptText).toContain("123 Orchard Road");
    expect(promptText).toContain("ORD-ELENA-2026: Cancelled");
  });
});
