import { Router } from "express";
import { NotificationsController } from "./notifications.controller.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { validate } from "../../shared/middleware/validate.js";
import { listNotificationsQuerySchema } from "./notifications.schemas.js";

const router = Router();
const controller = new NotificationsController();

router.get("/", authenticate, validate({ query: listNotificationsQuerySchema }), controller.list.bind(controller));
router.patch("/read-all", authenticate, controller.markAllRead.bind(controller));
router.patch("/:id/read", authenticate, controller.markRead.bind(controller));

export default router;