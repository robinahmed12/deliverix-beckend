import { describe, expect, it, vi, beforeEach } from "vitest";
import { outboxDispatchJob } from "../../src/jobs/handlers/outbox-dispatch.js";
import { notificationRetryJob } from "../../src/jobs/handlers/notification-retry.js";
import { nodemailerAdapter } from "../../src/integrations/email/nodemailer.adapter.js";
import type { Tx } from "../../src/jobs/lib/job-runner.js";

describe("Phase 6: Driver Journey End-to-End Validation (E2E)", () => {
  let sentEmails: any[] = [];
  let inAppNotifications: any[] = [];
  let notificationDeliveries: any[] = [];

  beforeEach(() => {
    sentEmails = [];
    inAppNotifications = [];
    notificationDeliveries = [];
    vi.spyOn(nodemailerAdapter, "send").mockImplementation(async (msg) => {
      sentEmails.push(msg);
      return { messageId: `e2e-msg-${sentEmails.length}` };
    });
  });

  function createMockTx(customer: { id: string; name: string; email: string; accountId: string | null }, driver: { id: string; code: string; phone: string; name: string }) {
    return {
      deliveryOrder: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          return Promise.resolve({
            id: where.id,
            orderNumber: `ORD-${where.id}`,
            deliveryAddress: "100 Innovation Way, Tech City",
            customer,
          });
        }),
      },
      driver: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          return Promise.resolve({
            id: where.id,
            driverCode: driver.code,
            contactPhone: driver.phone,
            account: { name: driver.name },
          });
        }),
      },
      user: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === customer.accountId) {
            return Promise.resolve({ id: customer.accountId, email: customer.email, name: customer.name });
          }
          return Promise.resolve(null);
        }),
      },
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation((args) => {
          const notif = { id: `notif-${inAppNotifications.length + 1}`, ...args.data };
          inAppNotifications.push(notif);
          return Promise.resolve(notif);
        }),
        findUnique: vi.fn().mockImplementation(({ where }) => {
          const found = inAppNotifications.find((n) => n.id === where.id);
          return Promise.resolve(found || null);
        }),
      },
      notificationDelivery: {
        create: vi.fn().mockImplementation((args) => {
          const del = { id: `del-${notificationDeliveries.length + 1}`, ...args.data };
          notificationDeliveries.push(del);
          return Promise.resolve(del);
        }),
        update: vi.fn().mockImplementation((args) => {
          const index = notificationDeliveries.findIndex((d) => d.id === args.where.id);
          if (index >= 0) {
            notificationDeliveries[index] = { ...notificationDeliveries[index], ...args.data };
          }
          return Promise.resolve(args);
        }),
      },
      outboxEvent: {
        update: vi.fn().mockResolvedValue({}),
      },
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Tx;
  }

  it("Task 6.1 (Happy Path): Complete order lifecycle triggers in-app and email at all 5 milestones", async () => {
    const customer = { id: "cus-reg", name: "Sarah Customer", email: "sarah@deliverix.test", accountId: "usr-sarah" };
    const driver = { id: "drv-99", code: "DRV-99", phone: "+15550009999", name: "David Driver" };
    const mockTx = createMockTx(customer, driver);

    const milestones = [
      { eventType: "assignment.accepted", payload: { orderId: "ord-happy", driverId: driver.id } },
      { eventType: "order.picked_up", payload: { orderId: "ord-happy", driverId: driver.id, pickedUpAt: "10:00 UTC" } },
      { eventType: "order.in_transit", payload: { orderId: "ord-happy", driverId: driver.id } },
      { eventType: "order.out_for_delivery", payload: { orderId: "ord-happy", driverId: driver.id } },
      { eventType: "order.delivered", payload: { orderId: "ord-happy", driverId: driver.id, deliveredAt: "10:45 UTC", recipientName: "Sarah Customer" } },
    ];

    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const row: any = {
        id: `evt-${i + 1}`,
        eventType: milestone.eventType,
        eventVersion: "1.0",
        aggregateType: milestone.eventType.startsWith("assignment") ? "assignment" : "order",
        aggregateId: milestone.payload.orderId,
        payload: milestone.payload,
        status: "Pending",
        attempts: 0,
        availableAfter: null,
        occurredAt: new Date(),
      };

      // 1. Process outbox event
      await outboxDispatchJob.claim(mockTx, row);
    }

    // Assert that 5 in-app notifications were created
    expect(inAppNotifications).toHaveLength(5);
    expect(inAppNotifications.map((n) => n.type)).toEqual([
      "assignment.accepted",
      "order.picked_up",
      "order.in_transit",
      "order.out_for_delivery",
      "order.delivered",
    ]);

    // Assert 5 InApp deliveries and 5 Email deliveries created
    const inAppDeliveries = notificationDeliveries.filter((d) => d.channel === "InApp");
    const emailDeliveries = notificationDeliveries.filter((d) => d.channel === "Email");
    expect(inAppDeliveries).toHaveLength(5);
    expect(emailDeliveries).toHaveLength(5);

    // 2. Process all email deliveries via notificationRetryJob
    for (const del of emailDeliveries) {
      await notificationRetryJob.claim(mockTx, del);
    }

    // Assert that 5 branded milestone emails were sent
    expect(sentEmails).toHaveLength(5);
    expect(sentEmails[0].subject).toContain("Driver Assigned");
    expect(sentEmails[1].subject).toContain("Order Picked Up");
    expect(sentEmails[2].subject).toContain("in transit");
    expect(sentEmails[3].subject).toContain("Out for Delivery");
    expect(sentEmails[4].subject).toContain("Delivered");

    // All emails sent to registered customer email
    sentEmails.forEach((email) => {
      expect(email.to).toBe("sarah@deliverix.test");
      expect(email.html).toContain("Sarah Customer");
    });
  });

  it("Task 6.2 (Failure Path): Delivery failure emits reason code and sends failure email", async () => {
    const customer = { id: "cus-fail", name: "Mark Customer", email: "mark@deliverix.test", accountId: "usr-mark" };
    const driver = { id: "drv-99", code: "DRV-99", phone: "+15550009999", name: "David Driver" };
    const mockTx = createMockTx(customer, driver);

    const failRow: any = {
      id: "evt-fail",
      eventType: "order.failed",
      eventVersion: "1.0",
      aggregateType: "order",
      aggregateId: "ord-fail",
      payload: {
        orderId: "ord-fail",
        driverId: driver.id,
        reasonCode: "RECIPIENT_UNAVAILABLE",
        reasonText: "No answer at the intercom",
        attemptNumber: 1,
      },
      status: "Pending",
      attempts: 0,
      availableAfter: null,
      occurredAt: new Date(),
    };

    await outboxDispatchJob.claim(mockTx, failRow);

    // Assert InApp notification created
    expect(inAppNotifications).toHaveLength(1);
    expect(inAppNotifications[0].type).toBe("order.failed");

    // Process email delivery
    const emailDel = notificationDeliveries.find((d) => d.channel === "Email");
    expect(emailDel).toBeDefined();
    await notificationRetryJob.claim(mockTx, emailDel);

    // Assert failure email sent with explanation
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("mark@deliverix.test");
    expect(sentEmails[0].subject).toContain("Unsuccessful");
    expect(sentEmails[0].html).toContain("RECIPIENT_UNAVAILABLE");
    expect(sentEmails[0].html).toContain("No answer at the intercom");
  });

  it("Task 6.3 (Guest Customer Path): Dispatches all emails directly to customer.email without FK errors", async () => {
    // Guest customer without accountId
    const customer = { id: "cus-guest", name: "Guest User", email: "guest@shopping.test", accountId: null };
    const driver = { id: "drv-99", code: "DRV-99", phone: "+15550009999", name: "David Driver" };
    const mockTx = createMockTx(customer, driver);

    const guestEvents = [
      { eventType: "assignment.accepted", payload: { orderId: "ord-guest", driverId: driver.id } },
      { eventType: "order.picked_up", payload: { orderId: "ord-guest", driverId: driver.id } },
      { eventType: "order.delivered", payload: { orderId: "ord-guest", driverId: driver.id, deliveredAt: "4:00 PM" } },
    ];

    for (let i = 0; i < guestEvents.length; i++) {
      const e = guestEvents[i];
      const row: any = {
        id: `evt-guest-${i + 1}`,
        eventType: e.eventType,
        eventVersion: "1.0",
        aggregateType: "order",
        aggregateId: e.payload.orderId,
        payload: e.payload,
        status: "Pending",
        attempts: 0,
        availableAfter: null,
        occurredAt: new Date(),
      };

      await outboxDispatchJob.claim(mockTx, row);
    }

    // In-App notifications must NOT be created for guest users
    expect(inAppNotifications).toHaveLength(0);

    // All 3 emails directly dispatched via nodemailerAdapter
    expect(sentEmails).toHaveLength(3);
    expect(sentEmails[0].to).toBe("guest@shopping.test");
    expect(sentEmails[0].subject).toContain("Driver Assigned");
    expect(sentEmails[1].to).toBe("guest@shopping.test");
    expect(sentEmails[1].subject).toContain("Order Picked Up");
    expect(sentEmails[2].to).toBe("guest@shopping.test");
    expect(sentEmails[2].subject).toContain("Delivered");
  });
});
