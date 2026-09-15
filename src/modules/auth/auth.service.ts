import { generateSecret, verifySync } from "otplib";
import { prisma } from "../../shared/utils/prisma.js";
import { hashPassword, verifyPassword } from "../../shared/utils/bcrypt.js";
import {
  signAccessToken,
  generateRefreshToken,
} from "../../shared/utils/jwt.js";
import { generateSecureToken } from "../../shared/utils/crypto.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import { env } from "../../config/env.js";
import { TOKEN } from "../../config/constants.js";
import { nodemailerAdapter } from "../../integrations/email/nodemailer.adapter.js";
import { passwordResetEmail } from "../../integrations/email/templates/password-reset.js";
import type { User } from "../../generated/prisma/client.js";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface TokenPairResult {
  tokens: AuthTokens;
  user: { id: string; email: string; name: string; status: string; mfaEnabled: boolean };
}

interface UserWithRoles extends User {
  roles: Array<{
    role: {
      name: string;
      permissions: Array<{ permission: { code: string } }>;
    };
  }>;
}

function toUserDto(user: UserWithRoles) {
  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = user.roles.flatMap((ur) =>
    ur.role.permissions.map((rp) => rp.permission.code),
  );
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    roles,
    permissions,
  };
}

async function getUserWithRoles(userId: string): Promise<UserWithRoles> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
  return user as UserWithRoles;
}

async function createTokenPair(user: UserWithRoles): Promise<TokenPairResult> {
  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = user.roles.flatMap((ur) =>
    ur.role.permissions.map((rp) => rp.permission.code),
  );

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    roles,
    permissions,
  });

  const refreshData = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshCredential.create({
    data: {
      userId: user.id,
      familyId: refreshData.familyId,
      tokenHash: refreshData.tokenHash,
      expiresAt,
    },
  });

  return {
    tokens: { accessToken, refreshToken: refreshData.token },
    user: toUserDto(user),
  };
}

export class AuthService {
  async login(email: string, password: string): Promise<TokenPairResult | { mfaRequired: true; mfaToken: string }> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.status === "Invited") {
      throw new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, "Invalid credentials");
    }

    if (user.status === "Suspended" || user.status === "Inactive") {
      throw new AppError(403, ErrorCodes.FORBIDDEN, "Account is not active");
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, "Invalid credentials");
    }

    if (user.mfaEnabled) {
      const mfaToken = generateSecureToken(32);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenFamilyId: mfaToken,
          expiresAt,
        },
      });
      return { mfaRequired: true, mfaToken };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const fullUser = await getUserWithRoles(user.id);
    return createTokenPair(fullUser);
  }

  async mfaVerify(mfaToken: string, code: string): Promise<TokenPairResult> {
    const session = await prisma.session.findFirst({
      where: {
        tokenFamilyId: mfaToken,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });

    if (!session) {
      throw new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, "Invalid or expired MFA token");
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });

    if (!user.mfaSecretCipher) {
      throw new AppError(500, "INTERNAL", "MFA secret not configured");
    }

    const isValid = verifySync({ token: code, secret: user.mfaSecretCipher }).valid;
    if (!isValid) {
      throw new AppError(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, "Invalid MFA code");
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const fullUser = await getUserWithRoles(user.id);
    return createTokenPair(fullUser);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const credential = await prisma.refreshCredential.findUnique({
      where: { tokenHash: refreshToken },
    });

    if (!credential) {
      throw new AppError(401, ErrorCodes.AUTH_SESSION_REVOKED, "Invalid refresh token");
    }

    if (credential.revokedAt) {
      await prisma.refreshCredential.updateMany({
        where: { familyId: credential.familyId },
        data: { revokedAt: new Date() },
      });
      throw new AppError(401, ErrorCodes.AUTH_SESSION_REVOKED, "Refresh token reuse detected");
    }

    if (credential.expiresAt < new Date()) {
      throw new AppError(401, ErrorCodes.AUTH_SESSION_REVOKED, "Refresh token expired");
    }

    await prisma.refreshCredential.update({
      where: { id: credential.id },
      data: { usedAt: new Date() },
    });

    const user = await getUserWithRoles(credential.userId);
    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = user.roles.flatMap((ur) =>
      ur.role.permissions.map((rp) => rp.permission.code),
    );

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      roles,
      permissions,
    });

    const newRefreshData = generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshCredential.create({
      data: {
        userId: user.id,
        familyId: credential.familyId,
        tokenHash: newRefreshData.tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: newRefreshData.token };
  }

  async logout(userId: string): Promise<void> {
    await prisma.refreshCredential.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await prisma.refreshCredential.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
    await prisma.session.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.status === "Invited") {
      return;
    }

    const resetToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + TOKEN.PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { invitationTokenHash: resetToken, invitationExpiresAt: expiresAt },
    });

    const resetUrl = `${env.CORS_ORIGINS.split(",")[0]?.trim()}/reset-password?token=${resetToken}`;
    const emailContent = passwordResetEmail({
      resetUrl,
      expiresIn: `${TOKEN.PASSWORD_RESET_EXPIRY_HOURS} hour`,
    });

    await nodemailerAdapter.send({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        invitationTokenHash: token,
        invitationExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Invalid or expired reset token");
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          invitationTokenHash: null,
          invitationExpiresAt: null,
        },
      }),
      prisma.refreshCredential.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async acceptInvitation(
    token: string,
    password: string,
    name: string,
  ): Promise<TokenPairResult> {
    const user = await prisma.user.findFirst({
      where: {
        invitationTokenHash: token,
        invitationExpiresAt: { gt: new Date() },
        status: "Invited",
      },
    });

    if (!user) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Invalid or expired invitation");
    }

    const passwordHash = await hashPassword(password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        name,
        status: "Active",
        invitationTokenHash: null,
        invitationExpiresAt: null,
      },
    });

    const fullUser = await getUserWithRoles(user.id);
    return createTokenPair(fullUser);
  }

  async getMe(userId: string) {
    const user = await getUserWithRoles(userId);
    return toUserDto(user);
  }

  async mfaEnrollment(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.mfaEnabled) {
      throw new AppError(409, ErrorCodes.ORDER_STATE_CONFLICT, "MFA is already enabled");
    }

    const secret = generateSecret();
    const otpauthUrl = `otpauth://totp/${env.MFA_ISSUER}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${env.MFA_ISSUER}`;

    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecretCipher: secret },
    });

    return { secret, otpauthUrl };
  }

  async mfaEnrollmentConfirm(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.mfaSecretCipher) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "MFA enrollment not initiated");
    }

    const isValid = verifySync({ token: code, secret: user.mfaSecretCipher }).valid;
    if (!isValid) {
      throw new AppError(422, ErrorCodes.VALIDATION_FAILED, "Invalid MFA code");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
  }
}