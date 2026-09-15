import { Router } from "express";
import { HealthController } from "./health.controller.js";

const router = Router();
const controller = new HealthController();

router.get("/live", controller.live.bind(controller));
router.get("/ready", controller.ready.bind(controller));

export default router;