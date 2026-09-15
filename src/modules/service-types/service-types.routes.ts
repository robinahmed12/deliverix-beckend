import { Router } from "express";
import { ServiceTypesController } from "./service-types.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { createServiceTypeSchema, updateServiceTypeSchema, listServiceTypesQuerySchema } from "./service-types.schemas.js";

const router = Router();
const controller = new ServiceTypesController();

router.get("/", authenticate, validate({ query: listServiceTypesQuerySchema }), controller.list.bind(controller));
router.post("/", authenticate, authorize("config.manage"), idempotent(), validate({ body: createServiceTypeSchema }), controller.create.bind(controller));
router.get("/:id", authenticate, controller.getById.bind(controller));
router.patch("/:id", authenticate, authorize("config.manage"), requireVersion, validate({ body: updateServiceTypeSchema }), controller.update.bind(controller));

export default router;