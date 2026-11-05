import { describe, expect, it, vi, beforeEach } from "vitest";
import { CustomerContextService } from "../../../../src/modules/customers/customer-context.service.js";
import { prisma } from "../../../../src/shared/utils/prisma.js";

describe("CustomerContextService Unit Tests (RAG Grounding)", () => {
  let service: CustomerContextService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new CustomerContextService();
  });

  it("builds customer context with profile, active orders, and attempt history", async () => {
    const mockCustomer = {
      id: "cust-1",
      name: "David Lee",
      email: "david@example.com",
      phone: "+15553334444",
      addresses: [
        {
          id: "addr-1",
          label: "Apartment",
          line1: "42 Wallaby Way",
          city: "Sydney",
          region: "NSW",
          postalCode: "2000",
          isDefault: true,
        },
      ],
    };

    const mockActiveOrders = [
      {
        id: "order-1",
        orderNumber: "ORD-9901",
        status: "Failed",
        pickupAddress: { line1: "Warehouse 1" },
        deliveryAddress: { line1: "42 Wallaby Way" },
        promisedAtStart: new Date("2026-11-05T10:00:00Z"),
        promisedAtEnd: new Date("2026-11-05T14:00:00Z"),
        deliveryFee: { toString: () => "15.00" },
        currencyCode: "USD",
        items: [{ name: "Headphones", quantity: 1, description: "Noise cancelling" }],
        attempts: [
          {
            attemptNumber: 1,
            status: "Failed",
            failureReason: { code: "CUSTOMER_UNAVAILABLE" },
            failureReasonText: "No answer at door or phone",
          },
        ],
        statusHistory: [
          {
            toStatus: "Failed",
            reasonCode: "CUSTOMER_UNAVAILABLE",
            createdAt: new Date("2026-11-05T13:30:00Z"),
          },
        ],
      },
    ];

    const mockCompletedOrders = [
      {
        id: "order-0",
        orderNumber: "ORD-9800",
        status: "Delivered",
        deliveredAt: new Date("2026-11-01T15:00:00Z"),
        cancelledAt: null,
        returnedAt: null,
      },
    ];

    vi.spyOn(prisma.customer, "findUnique").mockResolvedValue(mockCustomer as any);
    vi.spyOn(prisma.deliveryOrder, "findMany")
      .mockResolvedValueOnce(mockActiveOrders as any)
      .mockResolvedValueOnce(mockCompletedOrders as any);

    const context = await service.buildCustomerContext("user-david");

    expect(context.customer.name).toBe("David Lee");
    expect(context.savedAddresses).toHaveLength(1);
    expect(context.activeOrders).toHaveLength(1);
    expect(context.activeOrders[0]?.orderNumber).toBe("ORD-9901");
    expect(context.activeOrders[0]?.latestAttempt?.failureReasonCode).toBe("CUSTOMER_UNAVAILABLE");
    expect(context.summary.activeOrderCount).toBe(1);
    expect(context.summary.completedOrderCount).toBe(1);

    // Test prompt serialization
    const promptText = service.formatContextForPrompt(context);
    expect(promptText).toContain("David Lee");
    expect(promptText).toContain("ORD-9901");
    expect(promptText).toContain("CUSTOMER_UNAVAILABLE");
    expect(promptText).toContain("Headphones");
    expect(promptText).toContain("ORD-9800");
  });
});
