export * from "./invitation.js";
export * from "./password-reset.js";
export * from "./driver-accepted.js";
export * from "./order-picked-up.js";
export * from "./order-in-transit.js";
export * from "./order-out-for-delivery.js";
export * from "./order-delivered.js";
export * from "./order-failed.js";

import { driverAcceptedEmail } from "./driver-accepted.js";
import { orderPickedUpEmail } from "./order-picked-up.js";
import { orderInTransitEmail } from "./order-in-transit.js";
import { orderOutForDeliveryEmail } from "./order-out-for-delivery.js";
import { orderDeliveredEmail } from "./order-delivered.js";
import { orderFailedEmail } from "./order-failed.js";

export interface DriverStatusEmailInput {
  customerName: string;
  orderNumber: string;
  driverName?: string | undefined;
  driverCode?: string | undefined;
  contactPhone?: string | undefined;
  pickupTime?: string | undefined;
  deliveryWindow?: string | undefined;
  deliveryAddress?: string | undefined;
  deliveredAt?: string | undefined;
  recipientName?: string | undefined;
  proofType?: string | undefined;
  proofUrl?: string | undefined;
  reasonCode?: string | undefined;
  reasonText?: string | undefined;
  attemptNumber?: number | undefined;
  trackingUrl: string;
}

export function renderDriverStatusEmail(
  eventType: string,
  data: DriverStatusEmailInput,
): { subject: string; html: string; text: string } | null {
  switch (eventType) {
    case "assignment.accepted":
      return driverAcceptedEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        driverName: data.driverName,
        driverCode: data.driverCode || "Courier",
        contactPhone: data.contactPhone,
        trackingUrl: data.trackingUrl,
      });

    case "order.picked_up":
      return orderPickedUpEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        driverName: data.driverName,
        driverCode: data.driverCode || "Courier",
        pickupTime: data.pickupTime,
        trackingUrl: data.trackingUrl,
      });

    case "order.in_transit":
      return orderInTransitEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        driverName: data.driverName,
        driverCode: data.driverCode,
        deliveryWindow: data.deliveryWindow,
        trackingUrl: data.trackingUrl,
      });

    case "order.out_for_delivery":
      return orderOutForDeliveryEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        driverName: data.driverName,
        driverCode: data.driverCode,
        contactPhone: data.contactPhone,
        deliveryAddress: data.deliveryAddress,
        trackingUrl: data.trackingUrl,
      });

    case "order.delivered":
      return orderDeliveredEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        deliveredAt: data.deliveredAt,
        recipientName: data.recipientName,
        proofType: data.proofType,
        proofUrl: data.proofUrl,
        trackingUrl: data.trackingUrl,
      });

    case "order.failed":
      return orderFailedEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        attemptNumber: data.attemptNumber,
        reasonCode: data.reasonCode || "DELIVERY_FAILED",
        reasonText: data.reasonText,
        trackingUrl: data.trackingUrl,
      });

    default:
      return null;
  }
}
