export interface OrderDeliveredEmailData {
  customerName: string;
  orderNumber: string;
  deliveredAt?: string | undefined;
  recipientName?: string | undefined;
  proofType?: string | undefined;
  proofUrl?: string | undefined;
  trackingUrl: string;
}

export function orderDeliveredEmail(data: OrderDeliveredEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const timeDisplay = data.deliveredAt ?? new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  const recipientDisplay = data.recipientName ? `<p style="margin: 4px 0;"><strong>Received By:</strong> ${data.recipientName}</p>` : "";
  const proofDisplay = data.proofType ? `<p style="margin: 4px 0;"><strong>Proof of Delivery:</strong> Verified (${data.proofType})</p>` : "";
  const proofLink = data.proofUrl ? `<p style="margin: 4px 0;"><a href="${data.proofUrl}" style="color: #2563eb; text-decoration: underline;">View Delivery Proof Photo / Signature</a></p>` : "";

  return {
    subject: `Delivered: Order #${data.orderNumber} has arrived!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #166534; margin-bottom: 8px;">Order Delivered Successfully!</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${data.customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">Your package for order <strong>#${data.orderNumber}</strong> has been successfully delivered.</p>
        
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #15803d;">Delivery Receipt & Confirmation</h4>
          <p style="margin: 4px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          <p style="margin: 4px 0;"><strong>Delivered At:</strong> ${timeDisplay}</p>
          ${recipientDisplay}
          ${proofDisplay}
          ${proofLink}
          <p style="margin: 4px 0;"><strong>Status:</strong> Completed / Delivered</p>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.trackingUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Delivery Details</a>
        </p>

        <p style="font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Thank you for choosing Deliverix. If you have any feedback or notice any issues with your delivery, please let us know.
        </p>
      </div>
    `,
    text: `Hello ${data.customerName}, your order #${data.orderNumber} was delivered at ${timeDisplay}. Thank you for using Deliverix! Details: ${data.trackingUrl}`,
  };
}
