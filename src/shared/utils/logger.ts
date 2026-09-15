import { pino } from "pino";
import { env } from "../../config/env.js";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.otp",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.tokenHash",
  "*.secret",
  "*.secretCipher",
];

const options = {
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: "[REDACTED]" },
};

export const logger = env.LOG_PRETTY
  ? pino({ ...options, transport: { target: "pino-pretty" } })
  : pino(options);