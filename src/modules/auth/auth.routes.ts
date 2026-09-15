import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { rateLimiter } from "../../shared/middleware/rate-limiter.js";
import {
  loginSchema,
  mfaVerifySchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInvitationSchema,
  mfaEnrollmentConfirmSchema,
} from "./auth.schemas.js";

const router = Router();
const controller = new AuthController();

const authRateLimit = rateLimiter({ windowMs: 60_000, max: 20, keyPrefix: "auth" });
const passwordRateLimit = rateLimiter({ windowMs: 60_000, max: 5, keyPrefix: "pwd" });

router.post("/login", authRateLimit, validate({ body: loginSchema }), controller.login.bind(controller));
router.post("/mfa/verify", authRateLimit, validate({ body: mfaVerifySchema }), controller.mfaVerify.bind(controller));
router.post("/refresh", validate({ body: refreshSchema }), controller.refresh.bind(controller));
router.post("/logout", authenticate, controller.logout.bind(controller));
router.post("/logout-all", authenticate, controller.logoutAll.bind(controller));
router.post("/forgot-password", passwordRateLimit, validate({ body: forgotPasswordSchema }), controller.forgotPassword.bind(controller));
router.post("/reset-password", passwordRateLimit, validate({ body: resetPasswordSchema }), controller.resetPassword.bind(controller));
router.post("/accept-invitation", validate({ body: acceptInvitationSchema }), controller.acceptInvitation.bind(controller));
router.get("/me", authenticate, controller.me.bind(controller));
router.post("/mfa/enrollment", authenticate, controller.mfaEnrollment.bind(controller));
router.post("/mfa/enrollment/confirm", authenticate, validate({ body: mfaEnrollmentConfirmSchema }), controller.mfaEnrollmentConfirm.bind(controller));

export default router;