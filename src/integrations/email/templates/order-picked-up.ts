export interface OrderPickedUpEmailData {
  customerName: string;
  orderNumber: string;
  driverName?: string | undefined;
  driverCode: string;
  pickupTime?: string | undefined;
  trackingUrl: string;
}

export function orderPickedUpEmail(data: OrderPickedUpEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const driverDisplay = data.driverName ? `${data.driverName} (${data.driverCode})` : data.driverCode;
  const timeDisplay = data.pickupTime ?? new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

  return {
    subject: `Order Picked Up: #${data.orderNumber} is on the way!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Your order has been picked up!</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${data.customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">Your package for order <strong>#${data.orderNumber}</strong> has been collected from the pickup point by driver <strong>${driverDisplay}</strong> and is now in transit.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #334155;">Pickup Details</h4>
          <p style="margin: 4px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          <p style="margin: 4px 0;"><strong>Courier:</strong> ${driverDisplay}</p>
          <p style="margin: 4px 0;"><strong>Picked Up At:</strong> ${timeDisplay}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> Picked Up (In Custody)</p>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.trackingUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Track Your Package</a>
        </p>

        <p style="font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Deliverix Delivery Management System. If you have questions, please contact customer support.
        </p>
      </div>
    `,
    text: `Hello ${data.customerName}, your order #${data.orderNumber} was picked up by driver ${driverDisplay} at ${timeDisplay}. Track here: ${data.trackingUrl}`,
  };
}
