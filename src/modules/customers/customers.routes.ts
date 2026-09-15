import { Router } from "express";
import { CustomersController } from "./customers.controller.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { requireVersion } from "../../shared/middleware/require-version.js";
import { idempotent } from "../../shared/middleware/idempotent.js";
import {
  listCustomersQuerySchema,
  createCustomerSchema,
  updateCustomerSchema,
  createAddressSchema,
  updateAddressSchema,
} from "./customers.schemas.js";

const router = Router();
const controller = new CustomersController();

router.get(
  "/",
  authenticate,
  authorize("customers.view", "customers.manage"),
  validate({ query: listCustomersQuerySchema }),
  controller.list.bind(controller),
);

router.post(
  "/",
  authenticate,
  authorize("customers.manage"),
  idempotent(),
  validate({ body: createCustomerSchema }),
  controller.create.bind(controller),
);

router.get("/:id", authenticate, authorize("customers.view", "customers.manage"), controller.getById.bind(controller));

router.patch(
  "/:id",
  authenticate,
  authorize("customers.manage"),
  requireVersion,
  validate({ body: updateCustomerSchema }),
  controller.update.bind(controller),
);

router.get(
  "/:id/addresses",
  authenticate,
  authorize("customers.view", "customers.manage"),
  controller.listAddresses.bind(controller),
);

router.post(
  "/:id/addresses",
  authenticate,
  authorize("customers.manage"),
  idempotent(),
  validate({ body: createAddressSchema }),
  controller.createAddress.bind(controller),
);

router.patch(
  "/:id/addresses/:addressId",
  authenticate,
  authorize("customers.manage"),
  validate({ body: updateAddressSchema }),
  controller.updateAddress.bind(controller),
);

router.delete(
  "/:id/addresses/:addressId",
  authenticate,
  authorize("customers.manage"),
  controller.deleteAddress.bind(controller),
);

export default router;