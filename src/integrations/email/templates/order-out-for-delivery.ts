export interface OrderOutForDeliveryEmailData {
  customerName: string;
  orderNumber: string;
  driverName?: string | undefined;
  driverCode?: string | undefined;
  contactPhone?: string | undefined;
  deliveryAddress?: string | undefined;
  trackingUrl: string;
}

export function orderOutForDeliveryEmail(data: OrderOutForDeliveryEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const driverDisplay = data.driverName && data.driverCode ? `${data.driverName} (${data.driverCode})` : (data.driverName || data.driverCode || "Assigned Driver");
  const addressDisplay = data.deliveryAddress ? `<p style="margin: 4px 0;"><strong>Delivery Address:</strong> ${data.deliveryAddress}</p>` : "";
  const phoneDisplay = data.contactPhone ? `<p style="margin: 4px 0;"><strong>Driver Phone:</strong> ${data.contactPhone}</p>` : "";

  return {
    subject: `Out for Delivery: Order #${data.orderNumber} will arrive soon!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Your delivery is arriving soon!</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${data.customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">Driver <strong>${driverDisplay}</strong> is in your area and is heading to your address with order <strong>#${data.orderNumber}</strong>.</p>
        
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1e40af;">Final Delivery Leg</h4>
          <p style="margin: 4px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          <p style="margin: 4px 0;"><strong>Courier:</strong> ${driverDisplay}</p>
          ${phoneDisplay}
          ${addressDisplay}
          <p style="margin: 4px 0;"><strong>Action Required:</strong> Please ensure someone is available at the address to receive the package.</p>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.trackingUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Track Driver Proximity</a>
        </p>

        <p style="font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Deliverix Delivery Management System. If you have questions, please contact our support team.
        </p>
      </div>
    `,
    text: `Hello ${data.customerName}, order #${data.orderNumber} is now out for delivery with courier ${driverDisplay}. Please be available to receive your delivery. Track: ${data.trackingUrl}`,
  };
}
