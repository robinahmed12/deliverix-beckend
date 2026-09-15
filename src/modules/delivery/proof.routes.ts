import { Router } from "express";
import { ProofController } from "./proof.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { submitProofSchema, listProofsQuerySchema } from "./proof.schemas.js";

const router = Router();
const controller = new ProofController();

router.post("/orders/:orderId/proofs", authenticate, authorize("deliveries.execute"), idempotent(), validate({ body: submitProofSchema }), controller.submit.bind(controller));
router.get("/orders/:orderId/proofs", authenticate, authorize("orders.view"), validate({ query: listProofsQuerySchema }), controller.list.bind(controller));
router.post("/orders/:orderId/proofs/otp", authenticate, authorize("deliveries.execute"), idempotent(), controller.generateOtp.bind(controller));

export default router;