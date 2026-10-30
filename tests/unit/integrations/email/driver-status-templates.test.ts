import { describe, expect, it } from "vitest";
import {
  driverAcceptedEmail,
  orderPickedUpEmail,
  orderInTransitEmail,
  orderOutForDeliveryEmail,
  orderDeliveredEmail,
  orderFailedEmail,
  renderDriverStatusEmail,
} from "../../../../src/integrations/email/templates/index.js";

describe("Driver Journey Email Templates (Unit)", () => {
  const baseData = {
    customerName: "Alice Smith",
    orderNumber: "ORD-2026-001",
    driverName: "John Courier",
    driverCode: "DRV-404",
    contactPhone: "+15551234567",
    trackingUrl: "https://deliverix.test/tracking/ORD-2026-001",
  };

  it("Task 2.1: generates driverAcceptedEmail with full driver details", () => {
    const result = driverAcceptedEmail(baseData);

    expect(result.subject).toContain("ORD-2026-001");
    expect(result.subject).toContain("Driver Assigned");
    expect(result.html).toContain("Alice Smith");
    expect(result.html).toContain("John Courier (DRV-404)");
    expect(result.html).toContain("+15551234567");
    expect(result.html).toContain(baseData.trackingUrl);
    expect(result.text).toContain("Alice Smith");
    expect(result.text).toContain(baseData.trackingUrl);
  });

  it("Task 2.2: generates orderPickedUpEmail with pickup confirmation", () => {
    const result = orderPickedUpEmail({
      ...baseData,
      pickupTime: "10:30 UTC",
    });

    expect(result.subject).toContain("Order Picked Up");
    expect(result.subject).toContain("ORD-2026-001");
    expect(result.html).toContain("Alice Smith");
    expect(result.html).toContain("John Courier (DRV-404)");
    expect(result.html).toContain("10:30 UTC");
    expect(result.text).toContain("10:30 UTC");
  });

  it("Task 2.3: generates orderInTransitEmail with transit progress", () => {
    const result = orderInTransitEmail({
      ...baseData,
      deliveryWindow: "2:00 PM - 4:00 PM",
    });

    expect(result.subject).toContain("in transit");
    expect(result.html).toContain("In Transit");
    expect(result.html).toContain("2:00 PM - 4:00 PM");
    expect(result.text).toContain("in transit");
  });

  it("Task 2.4: generates orderOutForDeliveryEmail with proximity alert", () => {
    const result = orderOutForDeliveryEmail({
      ...baseData,
      deliveryAddress: "742 Evergreen Terrace",
    });

    expect(result.subject).toContain("Out for Delivery");
    expect(result.html).toContain("arriving soon");
    expect(result.html).toContain("742 Evergreen Terrace");
    expect(result.html).toContain("+15551234567");
    expect(result.text).toContain("out for delivery");
  });

  it("Task 2.5: generates orderDeliveredEmail with proof confirmation", () => {
    const result = orderDeliveredEmail({
      ...baseData,
      deliveredAt: "11:45 AM UTC",
      recipientName: "Bob Smith",
      proofType: "Signature",
      proofUrl: "https://storage.deliverix.test/proofs/p-1.png",
    });

    expect(result.subject).toContain("Delivered");
    expect(result.html).toContain("Order Delivered Successfully");
    expect(result.html).toContain("11:45 AM UTC");
    expect(result.html).toContain("Bob Smith");
    expect(result.html).toContain("Signature");
    expect(result.html).toContain("https://storage.deliverix.test/proofs/p-1.png");
    expect(result.text).toContain("delivered");
  });

  it("Task 2.6: generates orderFailedEmail with reason and next steps", () => {
    const result = orderFailedEmail({
      ...baseData,
      attemptNumber: 1,
      reasonCode: "RECIPIENT_UNAVAILABLE",
      reasonText: "No one answered the doorbell after 10 minutes",
    });

    expect(result.subject).toContain("Unsuccessful");
    expect(result.html).toContain("RECIPIENT_UNAVAILABLE");
    expect(result.html).toContain("No one answered the doorbell after 10 minutes");
    expect(result.html).toContain("Attempt:</strong> #1");
    expect(result.text).toContain("RECIPIENT_UNAVAILABLE");
  });

  it("Task 2.7: renderDriverStatusEmail dispatches to correct template", () => {
    const accepted = renderDriverStatusEmail("assignment.accepted", {
      ...baseData,
      trackingUrl: baseData.trackingUrl,
    });
    expect(accepted?.subject).toContain("Driver Assigned");

    const pickedUp = renderDriverStatusEmail("order.picked_up", {
      ...baseData,
      trackingUrl: baseData.trackingUrl,
    });
    expect(pickedUp?.subject).toContain("Order Picked Up");

    const transit = renderDriverStatusEmail("order.in_transit", {
      ...baseData,
      trackingUrl: baseData.trackingUrl,
    });
    expect(transit?.subject).toContain("in transit");

    const out = renderDriverStatusEmail("order.out_for_delivery", {
      ...baseData,
      trackingUrl: baseData.trackingUrl,
    });
    expect(out?.subject).toContain("Out for Delivery");

    const delivered = renderDriverStatusEmail("order.delivered", {
      ...baseData,
      deliveredAt: "12:00 UTC",
      trackingUrl: baseData.trackingUrl,
    });
    expect(delivered?.subject).toContain("Delivered");

    const failed = renderDriverStatusEmail("order.failed", {
      ...baseData,
      reasonCode: "ACCESS_DENIED",
      trackingUrl: baseData.trackingUrl,
    });
    expect(failed?.subject).toContain("Unsuccessful");

    const unknown = renderDriverStatusEmail("order.unknown_event", {
      ...baseData,
      trackingUrl: baseData.trackingUrl,
    });
    expect(unknown).toBeNull();
  });
});
