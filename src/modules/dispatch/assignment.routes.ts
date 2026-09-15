import { Router } from "express";
import { AssignmentController } from "../dispatch/assignment.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { createAssignmentSchema, reassignSchema, cancelSchema } from "../dispatch/dispatch.schemas.js";

const router = Router();
const controller = new AssignmentController();

router.post("/orders/:orderId/assignments", authenticate, authorize("dispatch.assign"), idempotent(), validate({ body: createAssignmentSchema }), controller.createForOrder.bind(controller));
router.post("/orders/:orderId/reassign", authenticate, authorize("dispatch.reassign"), idempotent(), validate({ body: reassignSchema }), controller.reassign.bind(controller));
router.post("/assignments/:id/accept", authenticate, authorize("deliveries.execute", "dispatch.assign"), controller.accept.bind(controller));
router.post("/assignments/:id/reject", authenticate, authorize("deliveries.execute"), controller.reject.bind(controller));
router.post("/assignments/:id/withdraw", authenticate, authorize("dispatch.assign", "dispatch.reassign"), idempotent(), validate({ body: cancelSchema }), controller.withdraw.bind(controller));

export default router;