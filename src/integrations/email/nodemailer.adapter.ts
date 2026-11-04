import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../shared/utils/logger.js";
import type { EmailAdapter, EmailMessage } from "./email.interface.js";

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    })
  : null;

export const nodemailerAdapter: EmailAdapter = {
  async send(message: EmailMessage): Promise<{ messageId: string }> {
    // 1. Primary: Brevo transactional HTTPS API (Port 443, immune to ISP port blocks)
    if (env.BREVO_API_KEY) {
      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": env.BREVO_API_KEY,
            "Content-Type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Deliverix", email: env.SMTP_FROM },
            to: [{ email: message.to }],
            subject: message.subject,
            htmlContent: message.html,
            ...(message.text ? { textContent: message.text } : {}),
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
          const errData = await response.text();
          logger.error({ status: response.status, body: errData, to: message.to }, "brevo api email delivery failed");
          throw new Error(`Brevo API error (${response.status}): ${errData}`);
        }

        const data = (await response.json()) as { messageId?: string };
        const messageId = data.messageId ?? `brevo-${Date.now()}`;
        logger.info({ messageId, to: message.to, subject: message.subject }, "email dispatched successfully via brevo api");
        return { messageId };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errorMsg, to: message.to }, "failed to send email via brevo api");
        throw err;
      }
    }

    // 2. Secondary: SMTP transport via nodemailer (if SMTP_HOST configured)
    if (transporter) {
      const result = await transporter.sendMail({
        from: env.SMTP_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      logger.info({ messageId: result.messageId, to: message.to }, "email dispatched via smtp transporter");
      return { messageId: result.messageId };
    }

    // 3. Fallback: Mock mode in local development
    const mockId = `mock-${Date.now()}`;
    logger.info({ messageId: mockId, to: message.to, subject: message.subject }, "[email-mock] message recorded in mock mode");
    return { messageId: mockId };
  },
};
