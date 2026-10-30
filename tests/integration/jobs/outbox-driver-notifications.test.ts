import { describe, expect, it, vi } from "vitest";
import { outboxDispatchJob } from "../../../src/jobs/handlers/outbox-dispatch.js";
import { notificationRetryJob } from "../../../src/jobs/handlers/notification-retry.js";
import { nodemailerAdapter } from "../../../src/integrations/email/nodemailer.adapter.js";
import type { Tx } from "../../../src/jobs/lib/job-runner.js";

describe("Outbox & Notification Dispatch Engine (Integration)", () => {
  it("Task 5.3a: Processes driver status event for registered customer with dual-channel delivery", async () => {
    const createdDeliveries: any[] = [];
    let updatedOutbox: any = null;

    const mockTx: any = {
      deliveryOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ord-101",
          orderNumber: "ORD-101",
          deliveryAddress: "123 Main St",
          customer: {
            id: "cus-1",
            name: "John Doe",
            email: "john@example.com",
            accountId: "usr-1",
          },
        }),
      },
      driver: {
        findUnique: vi.fn().mockResolvedValue({
          driverCode: "DRV-10",
          contactPhone: "+1234567890",
          account: { name: "Dave Driver" },
        }),
      },
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "notif-1" }),
      },
      notificationDelivery: {
        create: vi.fn().mockImplementation((args) => {
          createdDeliveries.push(args.data);
          return Promise.resolve({ id: `del-${createdDeliveries.length}` });
        }),
      },
      outboxEvent: {
        update: vi.fn().mockImplementation((args) => {
          updatedOutbox = args.data;
          return Promise.resolve(args);
        }),
      },
    };

    const outboxRow: any = {
      id: "evt-1",
      eventType: "order.picked_up",
      eventVersion: "1.0",
      aggregateType: "order",
      aggregateId: "ord-101",
      payload: {
        orderId: "ord-101",
        orderNumber: "ORD-101",
        driverId: "drv-1",
        pickedUpAt: new Date().toISOString(),
      },
      status: "Pending",
      attempts: 0,
      availableAfter: null,
      occurredAt: new Date(),
    };

    await outboxDispatchJob.claim(mockTx as Tx, outboxRow);

    // Assert InApp notification was created for usr-1
    expect(mockTx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "usr-1",
          orderId: "ord-101",
          type: "order.picked_up",
          channel: "InApp",
        }),
      }),
    );

    // Assert dual channel deliveries: 1 InApp + 1 Email
    expect(createdDeliveries).toHaveLength(2);
    expect(createdDeliveries[0].channel).toBe("InApp");
    expect(createdDeliveries[1].channel).toBe("Email");

    // Assert outbox marked Delivered
    expect(updatedOutbox?.status).toBe("Delivered");
  });

  it("Task 5.3b: Processes driver status event for guest customer without FK error", async () => {
    let emailSent = false;
    let sentEmailPayload: any = null;
    let updatedOutbox: any = null;

    vi.spyOn(nodemailerAdapter, "send").mockImplementation(async (msg) => {
      emailSent = true;
      sentEmailPayload = msg;
      return { messageId: "msg-test-123" };
    });

    const mockTx: any = {
      deliveryOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ord-guest",
          orderNumber: "ORD-GUEST-99",
          deliveryAddress: "456 Guest Lane",
          customer: {
            id: "cus-guest",
            name: "Guest Shopper",
            email: "guest@example.com",
            accountId: null, // ASM-003: Unlinked / Guest
          },
        }),
      },
      driver: {
        findUnique: vi.fn().mockResolvedValue({
          driverCode: "DRV-22",
          contactPhone: "+1987654321",
          account: { name: "Gary Driver" },
        }),
      },
      notification: {
        create: vi.fn(),
      },
      notificationDelivery: {
        create: vi.fn(),
      },
      outboxEvent: {
        update: vi.fn().mockImplementation((args) => {
          updatedOutbox = args.data;
          return Promise.resolve(args);
        }),
      },
    };

    const outboxRow: any = {
      id: "evt-guest-1",
      eventType: "order.out_for_delivery",
      eventVersion: "1.0",
      aggregateType: "order",
      aggregateId: "ord-guest",
      payload: {
        orderId: "ord-guest",
        orderNumber: "ORD-GUEST-99",
        driverId: "drv-22",
      },
      status: "Pending",
      attempts: 0,
      availableAfter: null,
      occurredAt: new Date(),
    };

    await outboxDispatchJob.claim(mockTx as Tx, outboxRow);

    // Assert InApp notification was NOT called (avoids foreign key constraint)
    expect(mockTx.notification.create).not.toHaveBeenCalled();

    // Assert email was directly sent to guest
    expect(emailSent).toBe(true);
    expect(sentEmailPayload.to).toBe("guest@example.com");
    expect(sentEmailPayload.subject).toContain("Out for Delivery");
    expect(sentEmailPayload.html).toContain("Guest Shopper");

    // Assert outbox marked Delivered
    expect(updatedOutbox?.status).toBe("Delivered");
  });

  it("Task 5.3c: Notification retry job delivers email with rendered template", async () => {
    let emailSentTo: string | null = null;
    let emailSubject: string | null = null;
    let deliveryUpdate: any = null;

    vi.spyOn(nodemailerAdapter, "send").mockImplementation(async (msg) => {
      emailSentTo = msg.to;
      emailSubject = msg.subject;
      return { messageId: "msg-retry-456" };
    });

    const mockTx: any = {
      notification: {
        findUnique: vi.fn().mockResolvedValue({
          id: "notif-77",
          userId: "usr-77",
          title: "Order Delivered",
          message: "Delivered successfully",
          channel: "Email",
          type: "order.delivered",
          orderId: "ord-77",
          payload: {
            orderNumber: "ORD-77",
            customerName: "Sam Test",
            customerEmail: "sam@example.com",
            deliveredAt: "3:00 PM UTC",
          },
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "usr-77",
          email: "sam@example.com",
          name: "Sam Test",
        }),
      },
      notificationDelivery: {
        update: vi.fn().mockImplementation((args) => {
          deliveryUpdate = args.data;
          return Promise.resolve(args);
        }),
      },
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const deliveryRow: any = {
      id: "nd-1",
      notificationId: "notif-77",
      channel: "Email",
      status: "Pending",
      attempts: 0,
      nextRetryAt: null,
    };

    await notificationRetryJob.claim(mockTx as Tx, deliveryRow);

    expect(emailSentTo).toBe("sam@example.com");
    expect(emailSubject).toContain("Delivered");
    expect(deliveryUpdate.status).toBe("Sent");
    expect(deliveryUpdate.providerRef).toBe("msg-retry-456");
  });
});
