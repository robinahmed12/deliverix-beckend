import { Router } from "express";
import { SupportRAGController } from "./support-rag.controller.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { authorize } from "../../shared/middleware/authorize.js";
import { validate } from "../../shared/middleware/validate.js";
import { supportChatSchema, supportFaqQuerySchema } from "./support-rag.schemas.js";

const router = Router();
const controller = new SupportRAGController();

/**
 * Customer Support AI Chat (RAG)
 * Retrieves grounded customer context & delivery policy knowledge chunks
 * and generates contextual responses via LangChain / OpenRouter.
 */
router.post(
  "/chat",
  authenticate,
  authorize("customers.me.view", "customers.manage"),
  validate({ body: supportChatSchema }),
  controller.chat.bind(controller),
);

/**
 * FAQ & Policy Knowledge Base retrieval
 */
router.get(
  "/faq",
  validate({ query: supportFaqQuerySchema }),
  controller.getFaqs.bind(controller),
);

export default router;
