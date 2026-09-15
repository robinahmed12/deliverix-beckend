import { Router } from "express";
import { ReportsController } from "./reports.controller.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  dashboardQuerySchema,
  deliveryReportQuerySchema,
  driverReportQuerySchema,
  zoneReportQuerySchema,
} from "./reports.schemas.js";

const router = Router();
const controller = new ReportsController();

router.get(
  "/dashboard",
  authenticate,
  authorize("reports.view"),
  validate({ query: dashboardQuerySchema }),
  controller.dashboard.bind(controller),
);
router.get(
  "/deliveries",
  authenticate,
  authorize("reports.view"),
  validate({ query: deliveryReportQuerySchema }),
  controller.deliveries.bind(controller),
);
router.get(
  "/drivers",
  authenticate,
  authorize("reports.view"),
  validate({ query: driverReportQuerySchema }),
  controller.drivers.bind(controller),
);
router.get(
  "/zones",
  authenticate,
  authorize("reports.view"),
  validate({ query: zoneReportQuerySchema }),
  controller.zones.bind(controller),
);

export default router;