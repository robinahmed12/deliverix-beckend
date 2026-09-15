import { Router } from "express";
import { VehiclesController } from "./vehicles.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { listVehiclesQuerySchema, createVehicleSchema, updateVehicleSchema, allocateVehicleSchema } from "./vehicles.schemas.js";

const router = Router();
const controller = new VehiclesController();

router.get("/", authenticate, authorize("drivers.view", "drivers.manage", "dispatch.view-queue"), validate({ query: listVehiclesQuerySchema }), controller.list.bind(controller));
router.post("/", authenticate, authorize("drivers.manage"), idempotent(), validate({ body: createVehicleSchema }), controller.create.bind(controller));
router.post("/:id/allocate", authenticate, authorize("drivers.manage"), idempotent(), validate({ body: allocateVehicleSchema }), controller.allocate.bind(controller));
router.post("/:id/deallocate", authenticate, authorize("drivers.manage"), idempotent(), controller.deallocate.bind(controller));
router.get("/:id", authenticate, authorize("drivers.view", "drivers.manage", "dispatch.view-queue"), controller.getById.bind(controller));
router.patch("/:id", authenticate, authorize("drivers.manage"), requireVersion, validate({ body: updateVehicleSchema }), controller.update.bind(controller));

export default router;