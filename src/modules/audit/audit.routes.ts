import { Router } from "express";
import { AuditController } from "./audit.controller.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { validate } from "../../shared/middleware/validate.js";
import { auditLogQuerySchema } from "./audit.schemas.js";

const router = Router();
const controller = new AuditController();

router.get(
  "/",
  authenticate,
  authorize("audit.view"),
  validate({ query: auditLogQuerySchema }),
  controller.list.bind(controller),
);

export default router;