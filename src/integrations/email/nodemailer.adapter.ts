import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import type { EmailAdapter, EmailMessage } from "./email.interface.js";

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    })
  : null;

export const nodemailerAdapter: EmailAdapter = {
  async send(message: EmailMessage) {
    if (!transporter) {
      return { messageId: `mock-${Date.now()}` };
    }
    const result = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { messageId: result.messageId };
  },
};