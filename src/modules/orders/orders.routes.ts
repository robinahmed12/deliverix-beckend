import { Router } from "express";
import { OrdersController } from "./orders.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import {
  createOrderSchema,
  updateOrderSchema,
  cancelOrderSchema,
  listOrdersQuerySchema,
  createNoteSchema,
  listNotesQuerySchema,
  failOrderSchema,
} from "./orders.schemas.js";

const router = Router();
const controller = new OrdersController();

router.post(
  "/",
  authenticate,
  authorize("orders.create"),
  idempotent(),
  validate({ body: createOrderSchema }),
  controller.create.bind(controller),
);

router.get(
  "/",
  authenticate,
  authorize("orders.view"),
  validate({ query: listOrdersQuerySchema }),
  controller.list.bind(controller),
);

router.get(
  "/:id/history",
  authenticate,
  authorize("orders.view"),
  controller.history.bind(controller),
);

router.get(
  "/:id/notes",
  authenticate,
  authorize("orders.view", "orders.internal-notes"),
  validate({ query: listNotesQuerySchema }),
  controller.listNotes.bind(controller),
);

router.post(
  "/:id/notes",
  authenticate,
  authorize("orders.internal-notes"),
  idempotent(),
  validate({ body: createNoteSchema }),
  controller.createNote.bind(controller),
);

/**
 * `orders.view` covers staff and the owning customer. `deliveries.execute`
 * additionally admits the currently-assigned driver; the service then enforces
 * that the driver actually holds an active/recent assignment for THIS order
 * (POD-002/POD-006-style order-level authorization). Without the shared escape
 * the driver cannot even load the order they are delivering.
 */
router.get("/:id", authenticate, authorize("orders.view", "deliveries.execute"), controller.getById.bind(controller));

router.patch(
  "/:id",
  authenticate,
  authorize("orders.edit"),
  requireVersion,
  validate({ body: updateOrderSchema }),
  controller.update.bind(controller),
);

router.post(
  "/:id/ready",
  authenticate,
  authorize("orders.edit"),
  idempotent(),
  controller.ready.bind(controller),
);

router.post(
  "/:id/cancel",
  authenticate,
  authorize("orders.cancel"),
  idempotent(),
  validate({ body: cancelOrderSchema }),
  controller.cancel.bind(controller),
);

router.post(
  "/:id/fail",
  authenticate,
  authorize("deliveries.execute"),
  idempotent(),
  validate({ body: failOrderSchema }),
  controller.fail.bind(controller),
);

export default router;