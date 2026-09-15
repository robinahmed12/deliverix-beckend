import { Router } from "express";
import { RolesController } from "./roles.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { listRolesQuerySchema } from "./roles.schemas.js";

const router = Router();
const controller = new RolesController();

router.get(
  "/",
  authenticate,
  validate({ query: listRolesQuerySchema }),
  controller.list.bind(controller),
);

export default router;