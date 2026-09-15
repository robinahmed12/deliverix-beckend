import { Router } from "express";
import { UsersController } from "./users.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import { listUsersQuerySchema, createUserSchema, setUserRolesSchema, updateUserSchema } from "./users.schemas.js";

const router = Router();
const controller = new UsersController();

router.get(
  "/",
  authenticate,
  authorize("users.view", "users.manage"),
  validate({ query: listUsersQuerySchema }),
  controller.list.bind(controller),
);

router.post(
  "/",
  authenticate,
  authorize("users.manage"),
  idempotent(),
  validate({ body: createUserSchema }),
  controller.create.bind(controller),
);

router.get(
  "/:id",
  authenticate,
  authorize("users.view", "users.manage"),
  controller.getById.bind(controller),
);

router.patch(
  "/:id",
  authenticate,
  authorize("users.manage"),
  requireVersion,
  validate({ body: updateUserSchema }),
  controller.update.bind(controller),
);

router.put(
  "/:id/roles",
  authenticate,
  authorize("users.manage"),
  validate({ body: setUserRolesSchema }),
  controller.replaceRoles.bind(controller),
);

export default router;