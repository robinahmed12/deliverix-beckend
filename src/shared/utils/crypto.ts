import { randomBytes } from "node:crypto";

export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function generateOtpSecret(): string {
  const bytes = randomBytes(20);
  return bytes.toString("hex");
}