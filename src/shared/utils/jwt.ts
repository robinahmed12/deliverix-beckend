import jwt, { type Secret } from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "../../config/env.js";
import { randomBytes } from "node:crypto";

export interface AccessTokenPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
}

const accessSecret: Secret = env.JWT_ACCESS_SECRET;

export interface RefreshTokenData {
  token: string;
  tokenHash: string;
  familyId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, accessSecret, {
    expiresIn: env.JWT_ACCESS_TTL as StringValue,
    issuer: "deliverix",
    subject: payload.userId,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, accessSecret, {
    issuer: "deliverix",
  }) as AccessTokenPayload;
}

export function generateRefreshToken(): RefreshTokenData {
  const token = randomBytes(48).toString("base64url");
  const familyId = randomBytes(16).toString("base64url");
  return { token, tokenHash: token, familyId };
}

export function hashToken(token: string): string {
  return token;
}