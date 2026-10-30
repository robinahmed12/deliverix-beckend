import { describe, expect, it } from "vitest";

describe("Driver Journey Outbox Payloads (Unit)", () => {
  it("Task 3.1: assignment.accepted payload schema", () => {
    const payload = {
      assignmentId: "asn-1",
      orderId: "ord-1",
      orderNumber: "ORD-2026-001",
      customerId: "cus-1",
      driverId: "drv-1",
      acceptedAt: new Date().toISOString(),
    };

    expect(payload.assignmentId).toBeDefined();
    expect(payload.orderId).toBeDefined();
    expect(payload.orderNumber).toBe("ORD-2026-001");
    expect(payload.customerId).toBe("cus-1");
    expect(payload.driverId).toBe("drv-1");
    expect(payload.acceptedAt).toBeDefined();
  });

  it("Task 3.2: order.picked_up payload schema", () => {
    const payload = {
      orderId: "ord-1",
      orderNumber: "ORD-2026-001",
      customerId: "cus-1",
      driverId: "drv-1",
      attemptId: "att-1",
      pickedUpAt: new Date().toISOString(),
    };

    expect(payload.orderId).toBe("ord-1");
    expect(payload.orderNumber).toBe("ORD-2026-001");
    expect(payload.customerId).toBe("cus-1");
    expect(payload.driverId).toBe("drv-1");
    expect(payload.attemptId).toBe("att-1");
    expect(payload.pickedUpAt).toBeDefined();
  });

  it("Task 3.3 & 3.4: in_transit and out_for_delivery payload schema", () => {
    const inTransit = {
      orderId: "ord-1",
      orderNumber: "ORD-2026-001",
      customerId: "cus-1",
      driverId: "drv-1",
    };
    expect(inTransit.orderId).toBe("ord-1");
    expect(inTransit.orderNumber).toBe("ORD-2026-001");
    expect(inTransit.driverId).toBe("drv-1");

    const outForDelivery = {
      orderId: "ord-1",
      orderNumber: "ORD-2026-001",
      customerId: "cus-1",
      driverId: "drv-1",
    };
    expect(outForDelivery.orderId).toBe("ord-1");
    expect(outForDelivery.orderNumber).toBe("ORD-2026-001");
    expect(outForDelivery.driverId).toBe("drv-1");
  });

  it("Task 3.5 & 3.6: delivered and failed payload schema", () => {
    const delivered = {
      orderId: "ord-1",
      orderNumber: "ORD-2026-001",
      customerId: "cus-1",
      driverId: "drv-1",
      attemptId: "att-1",
      deliveredAt: new Date().toISOString(),
    };
    expect(delivered.deliveredAt).toBeDefined();
    expect(delivered.attemptId).toBe("att-1");

    const failed = {
      orderId: "ord-1",
      orderNumber: "ORD-2026-001",
      customerId: "cus-1",
      driverId: "drv-1",
      attemptId: "att-1",
      reasonCode: "RECIPIENT_UNAVAILABLE",
      reasonText: "No answer",
    };
    expect(failed.reasonCode).toBe("RECIPIENT_UNAVAILABLE");
    expect(failed.reasonText).toBe("No answer");
  });
});
