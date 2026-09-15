import { Router } from "express";
import { DispatchController } from "./dispatch.controller.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { validate } from "../../shared/middleware/validate.js";
import { dispatchQueueQuerySchema, workloadQuerySchema } from "./dispatch.schemas.js";

const router = Router();
const controller = new DispatchController();

router.get("/queue", authenticate, authorize("dispatch.view-queue"), validate({ query: dispatchQueueQuerySchema }), controller.queue.bind(controller));
router.get("/workloads", authenticate, authorize("dispatch.view-queue"), validate({ query: workloadQuerySchema }), controller.workloads.bind(controller));
router.get("/orders/:orderId/assignments", authenticate, authorize("dispatch.view-queue"), controller.assignmentHistory.bind(controller));

export default router;