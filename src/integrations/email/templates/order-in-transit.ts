export interface OrderInTransitEmailData {
  customerName: string;
  orderNumber: string;
  driverName?: string | undefined;
  driverCode?: string | undefined;
  deliveryWindow?: string | undefined;
  trackingUrl: string;
}

export function orderInTransitEmail(data: OrderInTransitEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const driverDisplay = data.driverName && data.driverCode ? `${data.driverName} (${data.driverCode})` : (data.driverName || data.driverCode || "Assigned Driver");
  const windowDisplay = data.deliveryWindow ? `<p style="margin: 4px 0;"><strong>Estimated Delivery:</strong> ${data.deliveryWindow}</p>` : "";

  return {
    subject: `Order Update: #${data.orderNumber} is in transit`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Your order is moving!</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${data.customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">Package <strong>#${data.orderNumber}</strong> is currently on the move and in transit to your delivery destination.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #334155;">Transit Status</h4>
          <p style="margin: 4px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          <p style="margin: 4px 0;"><strong>Courier:</strong> ${driverDisplay}</p>
          <p style="margin: 4px 0;"><strong>Current Status:</strong> In Transit</p>
          ${windowDisplay}
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.trackingUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Live Tracking</a>
        </p>

        <p style="font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Deliverix Delivery Management System. If you have questions, please reach out to customer support.
        </p>
      </div>
    `,
    text: `Hello ${data.customerName}, your order #${data.orderNumber} is now in transit with courier ${driverDisplay}. Track live progress: ${data.trackingUrl}`,
  };
}
