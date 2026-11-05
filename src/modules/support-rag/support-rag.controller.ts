import type { Request, Response, NextFunction } from "express";
import { supportRAGService } from "./support-rag.service.js";

export class SupportRAGController {
  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await supportRAGService.processCustomerQuery(req.auth!.userId, req.body);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async getFaqs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const faqs = supportRAGService.getFaqs(category, search);
      res.status(200).json({ data: faqs });
    } catch (err) {
      next(err);
    }
  }
}
