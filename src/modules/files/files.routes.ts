import { Router } from "express";
import { FilesController } from "./files.controller.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { validate } from "../../shared/middleware/validate.js";
import { scanResultSchema, orderIdUnlinkedQuerySchema } from "./files.schemas.js";

const router = Router();
const controller = new FilesController();

router.post("/upload", authenticate, authorize("deliveries.execute"), idempotent(), controller.uploadMiddleware, controller.upload.bind(controller));
router.post("/:id/scan-result", authenticate, authorize("config.manage"), validate({ body: scanResultSchema }), controller.updateScanStatus.bind(controller));
router.get("/:id/signed-url", authenticate, controller.signedUrl.bind(controller));

/**
 * Discards an upload that is not attached to proof evidence (FILE-010-style
 * cleanup with user intent; the record itself is never hard-deleted). The
 * uploading driver or staff only — ownership enforced in the service.
 */
router.delete("/:id", authenticate, authorize("deliveries.execute", "drivers.manage"), controller.discard.bind(controller));

/** Unused (unlinked) uploads for an order — lets drivers free upload quota themselves. */
router.get("/", authenticate, authorize("deliveries.execute", "drivers.view", "dispatch.view-queue", "orders.view"), validate({ query: orderIdUnlinkedQuerySchema }), controller.listUnlinked.bind(controller));

export default router;