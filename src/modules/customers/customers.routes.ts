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
  updateMeProfileSchema,
  linkAccountSchema,
} from "./customers.schemas.js";

const router = Router();
const controller = new CustomersController();

router.get(
  "/me",
  authenticate,
  authorize("customers.me.view", "customers.manage"),
  controller.getMe.bind(controller),
);

router.get(
  "/me/rag-context",
  authenticate,
  authorize("customers.me.view", "customers.manage"),
  controller.getRAGContext.bind(controller),
);

router.patch(
  "/me",
  authenticate,
  authorize("customers.me.update", "customers.manage"),
  validate({ body: updateMeProfileSchema }),
  controller.updateMe.bind(controller),
);

router.post(
  "/me/link-account",
  authenticate,
  validate({ body: linkAccountSchema }),
  controller.linkAccount.bind(controller),
);

router.get(
  "/me/addresses",
  authenticate,
  authorize("customers.me.addresses", "customers.manage"),
  controller.listMyAddresses.bind(controller),
);

router.post(
  "/me/addresses",
  authenticate,
  authorize("customers.me.addresses", "customers.manage"),
  idempotent(),
  validate({ body: createAddressSchema }),
  controller.createMyAddress.bind(controller),
);

router.patch(
  "/me/addresses/:addressId",
  authenticate,
  authorize("customers.me.addresses", "customers.manage"),
  validate({ body: updateAddressSchema }),
  controller.updateMyAddress.bind(controller),
);

router.delete(
  "/me/addresses/:addressId",
  authenticate,
  authorize("customers.me.addresses", "customers.manage"),
  controller.deleteMyAddress.bind(controller),
);

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