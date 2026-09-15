import { Router } from "express";
import { ZonesController } from "./zones.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { createZoneSchema, updateZoneSchema, listZonesQuerySchema } from "./zones.schemas.js";

const router = Router();
const controller = new ZonesController();

router.get("/", authenticate, validate({ query: listZonesQuerySchema }), controller.list.bind(controller));
router.post("/", authenticate, authorize("zones.manage"), idempotent(), validate({ body: createZoneSchema }), controller.create.bind(controller));
router.get("/:id", authenticate, controller.getById.bind(controller));
router.patch("/:id", authenticate, authorize("zones.manage"), requireVersion, validate({ body: updateZoneSchema }), controller.update.bind(controller));

export default router;