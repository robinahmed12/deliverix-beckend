import { Router } from "express";
import { ConfigManagementController } from "./config-management.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import {
  createFailureReasonSchema,
  updateFailureReasonSchema,
  createProofPolicySchema,
  updateProofPolicySchema,
  updateSettingSchema,
} from "./config-management.schemas.js";

const router = Router();
const controller = new ConfigManagementController();

router.get("/failure-reasons", authenticate, controller.listFailureReasons.bind(controller));
router.post("/failure-reasons", authenticate, authorize("config.manage"), idempotent(), validate({ body: createFailureReasonSchema }), controller.createFailureReason.bind(controller));
router.patch("/failure-reasons/:id", authenticate, authorize("config.manage"), validate({ body: updateFailureReasonSchema }), controller.updateFailureReason.bind(controller));

router.get("/proof-policies", authenticate, controller.listProofPolicies.bind(controller));
router.post("/proof-policies", authenticate, authorize("config.manage"), idempotent(), validate({ body: createProofPolicySchema }), controller.createProofPolicy.bind(controller));
router.patch("/proof-policies/:id", authenticate, authorize("config.manage"), validate({ body: updateProofPolicySchema }), controller.activateProofPolicy.bind(controller));

router.get("/settings", authenticate, authorize("config.manage"), controller.listSettings.bind(controller));
router.patch("/settings/:key", authenticate, authorize("config.manage"), validate({ body: updateSettingSchema }), controller.updateSetting.bind(controller));

export default router;