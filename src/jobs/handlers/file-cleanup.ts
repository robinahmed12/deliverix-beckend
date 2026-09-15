import type { JobHandler, ClaimableRow } from "../lib/job-runner.js";
import { CloudinaryAdapter } from "../../integrations/storage/cloudinary.adapter.js";
import { logger } from "../../shared/utils/logger.js";

interface FileRow extends ClaimableRow {
  key: string;
  provider: string;
}

const storage = new CloudinaryAdapter();

export const fileCleanupJob: JobHandler<FileRow> = {
  name: "file-cleanup",
  query: `
    SELECT f.id, f.key, f.provider
    FROM file_objects f
    WHERE f.status IN ('Uploaded', 'Scanning')
      AND f.uploaded_at < NOW() - INTERVAL '24 hours'
    ORDER BY f.uploaded_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,
  async claim(tx, row) {
    await tx.fileObject.update({
      where: { id: row.id },
      data: {
        status: "Rejected",
        scanResult: "ABANDONED_UPLOAD_CLEANUP",
        scannedAt: new Date(),
        expiresAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (row.key && row.key !== "pending" && row.provider === "cloudinary") {
      try {
        await storage.delete(row.key);
      } catch (error) {
        logger.warn({ fileId: row.id, err: error }, "failed to delete abandoned upload from storage");
      }
    }
  },
};