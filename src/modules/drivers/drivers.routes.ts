import { Router } from "express";
import { DriversController } from "./drivers.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import {
  listDriversQuerySchema,
  createDriverSchema,
  updateDriverSchema,
  setAvailabilitySchema,
} from "./drivers.schemas.js";

const router = Router();
const controller = new DriversController();

router.get("/", authenticate, authorize("drivers.view", "drivers.manage", "dispatch.view-queue"), validate({ query: listDriversQuerySchema }), controller.list.bind(controller));
router.post("/", authenticate, authorize("drivers.manage"), idempotent(), validate({ body: createDriverSchema }), controller.create.bind(controller));
router.get("/me", authenticate, authorize("drivers.view", "deliveries.execute"), controller.me.bind(controller));
router.put("/me/availability", authenticate, authorize("deliveries.execute"), validate({ body: setAvailabilitySchema }), controller.setAvailability.bind(controller));
router.get("/me/assignments", authenticate, authorize("deliveries.execute"), controller.myAssignments.bind(controller));
router.get("/:id", authenticate, authorize("drivers.view", "drivers.manage", "dispatch.view-queue"), controller.getById.bind(controller));
router.patch("/:id", authenticate, authorize("drivers.manage"), requireVersion, validate({ body: updateDriverSchema }), controller.update.bind(controller));

export default router;