export interface OrderFailedEmailData {
  customerName: string;
  orderNumber: string;
  attemptNumber?: number | undefined;
  reasonCode: string;
  reasonText?: string | undefined;
  trackingUrl: string;
}

export function orderFailedEmail(data: OrderFailedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const attemptDisplay = data.attemptNumber ? `<p style="margin: 4px 0;"><strong>Attempt:</strong> #${data.attemptNumber}</p>` : "";
  const reasonDisplay = data.reasonText ? `${data.reasonCode} - ${data.reasonText}` : data.reasonCode;

  return {
    subject: `Delivery Attempt Unsuccessful: Order #${data.orderNumber}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
        <h2 style="color: #991b1b; margin-bottom: 8px;">Delivery Attempt Unsuccessful</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${data.customerName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">We were unable to complete the delivery for order <strong>#${data.orderNumber}</strong>.</p>
        
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #b91c1c;">Attempt Details</h4>
          <p style="margin: 4px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          ${attemptDisplay}
          <p style="margin: 4px 0;"><strong>Reason:</strong> ${reasonDisplay}</p>
          <p style="margin: 4px 0;"><strong>What Happens Next:</strong> Our operations team will assess whether a redelivery can be scheduled or if package return is required.</p>
        </div>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${data.trackingUrl}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Check Order Status & Options</a>
        </p>

        <p style="font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Need assistance? Please contact Deliverix Customer Support with your order number.
        </p>
      </div>
    `,
    text: `Hello ${data.customerName}, delivery attempt for order #${data.orderNumber} was unsuccessful (Reason: ${reasonDisplay}). Check options here: ${data.trackingUrl}`,
  };
}
