import type { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service.js";

const authService = new AuthService();

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      if ("mfaRequired" in result) {
        res.status(200).json({ mfaRequired: true, mfaToken: result.mfaToken });
        return;
      }
      res.cookie("access_token", result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refresh_token", result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.status(200).json({ data: result.user });
    } catch (err) {
      next(err);
    }
  }

  async mfaVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.mfaVerify(req.body.mfaToken, req.body.code);
      res.cookie("access_token", result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refresh_token", result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.status(200).json({ data: result.user });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.body.refreshToken ?? req.cookies?.refresh_token;
      if (!refreshToken) {
        res.status(401).json({
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          detail: "Refresh token required",
          code: "AUTH_SESSION_REVOKED",
          requestId: req.requestId,
        });
        return;
      }
      const tokens = await authService.refresh(refreshToken);
      res.cookie("access_token", tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refresh_token", tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.status(200).json({ data: { rotated: true } });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ detail: "Authentication required", code: "AUTH_INVALID_CREDENTIALS" });
        return;
      }
      await authService.logout(req.auth.userId);
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ detail: "Authentication required", code: "AUTH_INVALID_CREDENTIALS" });
        return;
      }
      await authService.logoutAll(req.auth.userId);
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.forgotPassword(req.body.email);
      res.status(200).json({
        data: { message: "If an account exists with that email, a reset link has been sent" },
      });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.resetPassword(req.body.token, req.body.password);
      res.status(200).json({ data: { message: "Password reset successfully" } });
    } catch (err) {
      next(err);
    }
  }

  async acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.acceptInvitation(
        req.body.token,
        req.body.password,
        req.body.name,
      );
      res.cookie("access_token", result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refresh_token", result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.status(200).json({ data: result.user });
    } catch (err) {
      next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ detail: "Authentication required", code: "AUTH_INVALID_CREDENTIALS" });
        return;
      }
      const user = await authService.getMe(req.auth.userId);
      res.status(200).json({ data: user });
    } catch (err) {
      next(err);
    }
  }

  async mfaEnrollment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ detail: "Authentication required", code: "AUTH_INVALID_CREDENTIALS" });
        return;
      }
      const result = await authService.mfaEnrollment(req.auth.userId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async mfaEnrollmentConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({ detail: "Authentication required", code: "AUTH_INVALID_CREDENTIALS" });
        return;
      }
      await authService.mfaEnrollmentConfirm(req.auth.userId, req.body.code);
      res.status(200).json({ data: { message: "MFA enabled successfully" } });
    } catch (err) {
      next(err);
    }
  }
}