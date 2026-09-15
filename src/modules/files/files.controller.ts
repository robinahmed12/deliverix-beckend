import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { FilesService } from "./files.service.js";

const filesService = new FilesService();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

function meta(req: Request) {
  const m: { requestId: string; ip?: string } = { requestId: req.requestId };
  if (req.ip) m.ip = req.ip;
  return m;
}

function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing required parameter");
  return value;
}

const auth = (req: Request) => ({ userId: req.auth!.userId, roles: req.auth!.roles });

export class FilesController {
  get uploadMiddleware() {
    return upload.single("file");
  }

  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(422).json({
          type: "about:blank",
          title: "Validation Failed",
          status: 422,
          detail: "No file provided or file type not allowed",
          code: "VALIDATION_FAILED",
          requestId: req.requestId,
        });
        return;
      }

      const orderId = typeof req.body.orderId === "string" ? req.body.orderId : undefined;
      const attemptId = typeof req.body.attemptId === "string" ? req.body.attemptId : undefined;

      const result = await filesService.upload(
        orderId,
        attemptId,
        { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, buffer: req.file.buffer },
        req.auth!.userId,
        meta(req),
      );
      res.status(201).json({ data: result });
    } catch (err) { next(err); }
  }

  async signedUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await filesService.getSignedUrl(str(req.params.id), auth(req)) });
    } catch (err) { next(err); }
  }

  async updateScanStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await filesService.updateScanStatus(str(req.params.id), req.body, meta(req)) });
    } catch (err) { next(err); }
  }
}