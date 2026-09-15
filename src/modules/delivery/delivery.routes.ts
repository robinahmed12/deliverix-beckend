import { Router } from "express";
import { DeliveryController } from "./delivery.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import {
  pickupSchema,
  failOrderSchema,
  retryDeliverySchema,
  rescheduleOrderSchema,
  startReturnSchema,
  returnProofSchema,
  confirmPickupReceiptSchema,
  attemptsQuerySchema,
} from "./delivery.schemas.js";

const router = Router();
const controller = new DeliveryController();

router.post("/orders/:orderId/pickup", authenticate, authorize("deliveries.execute"), idempotent(), validate({ body: pickupSchema }), controller.pickup.bind(controller));
router.post("/orders/:orderId/in-transit", authenticate, authorize("deliveries.execute"), idempotent(), validate({ body: pickupSchema }), controller.inTransit.bind(controller));
router.post("/orders/:orderId/out-for-delivery", authenticate, authorize("deliveries.execute"), idempotent(), validate({ body: pickupSchema }), controller.outForDelivery.bind(controller));
router.post("/orders/:orderId/deliver", authenticate, authorize("deliveries.execute"), requireVersion, idempotent(), validate({ body: pickupSchema }), controller.deliver.bind(controller));
router.post("/orders/:orderId/fail", authenticate, authorize("deliveries.execute"), idempotent(), validate({ body: failOrderSchema }), controller.fail.bind(controller));
router.post("/orders/:orderId/retry", authenticate, authorize("deliveries.execute", "dispatch.reassign"), idempotent(), validate({ body: retryDeliverySchema }), controller.retry.bind(controller));
router.post("/orders/:orderId/reschedule", authenticate, authorize("dispatch.reassign"), requireVersion, idempotent(), validate({ body: rescheduleOrderSchema }), controller.reschedule.bind(controller));
router.post("/orders/:orderId/return", authenticate, authorize("dispatch.reassign"), requireVersion, idempotent(), validate({ body: startReturnSchema }), controller.startReturn.bind(controller));
router.post("/orders/:orderId/return-proof", authenticate, authorize("deliveries.execute"), idempotent(), validate({ body: returnProofSchema }), controller.returnProof.bind(controller));
router.post("/orders/:orderId/confirm-return", authenticate, authorize("dispatch.reassign"), requireVersion, idempotent(), validate({ body: pickupSchema }), controller.confirmReturn.bind(controller));
router.post("/orders/:orderId/confirm-pickup-receipt", authenticate, authorize("dispatch.reassign"), requireVersion, idempotent(), validate({ body: confirmPickupReceiptSchema }), controller.confirmPickupReceipt.bind(controller));
router.get("/orders/:orderId/attempts", authenticate, authorize("orders.view"), validate({ query: attemptsQuerySchema }), controller.getAttempts.bind(controller));
router.get("/orders/:orderId/tracking", authenticate, controller.getTracking.bind(controller));

export default router;