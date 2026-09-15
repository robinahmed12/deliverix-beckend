import { Router } from "express";
import { FilesController } from "./files.controller.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { validate } from "../../shared/middleware/validate.js";
import { scanResultSchema } from "./files.schemas.js";

const router = Router();
const controller = new FilesController();

router.post("/upload", authenticate, authorize("deliveries.execute"), idempotent(), controller.uploadMiddleware, controller.upload.bind(controller));
router.post("/:id/scan-result", authenticate, authorize("config.manage"), validate({ body: scanResultSchema }), controller.updateScanStatus.bind(controller));
router.get("/:id/signed-url", authenticate, controller.signedUrl.bind(controller));

export default router;