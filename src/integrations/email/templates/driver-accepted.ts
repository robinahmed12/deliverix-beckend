export interface DriverAcceptedEmailData {
  customerName: string;
  orderNumber: string;
  driverName?: string | undefined;
  driverCode: string;
  contactPhone?: string | undefined;
  trackingUrl: string;
}

export function driverAcceptedEmail(data: DriverAcceptedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const driverDisplay = data.driverName ? `${data.driverName} (${data.driverCode})` : data.driverCode;

  return {
    subject: `Driver Assigned: Order #${data.orderNumber} is on the way!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">A driver has been assigned to your order!</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${data.customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">Great news! Driver <strong>${driverDisplay}</strong> has accepted delivery order <strong>#${data.orderNumber}</strong> and is preparing for pickup.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #334155;">Assignment Summary</h4>
          <p style="margin: 4px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          <p style="margin: 4px 0;"><strong>Assigned Driver:</strong> ${driverDisplay}</p>
          ${data.contactPhone ? `<p style="margin: 4px 0;"><strong>Driver Phone:</strong> ${data.contactPhone}</p>` : ""}
          <p style="margin: 4px 0;"><strong>Status:</strong> Assigned</p>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.trackingUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Track Your Order</a>
        </p>

        <p style="font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Deliverix Delivery Management System. If you have questions, please reach out to our customer support.
        </p>
      </div>
    `,
    text: `Hello ${data.customerName}, driver ${driverDisplay} has accepted order #${data.orderNumber}. Track your order here: ${data.trackingUrl}`,
  };
}
