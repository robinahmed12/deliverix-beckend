import type { JobHandler, ClaimableRow } from "../lib/job-runner.js";
import { writeAudit } from "../../shared/utils/audit.js";
import { logger } from "../../shared/utils/logger.js";

interface FileRow extends ClaimableRow {
  originalName: string | null;
}

/**
 * DEV/STAGING ONLY — stand-in for the external malware scanner.
 *
 * Production flow: an external AV service calls `POST /files/:id/scan-result`
 * (FILE-002) to move files out of `Scanning`. Without such a service, uploaded
 * proof files would stay in `Scanning` forever and could never satisfy POD-003,
 * so delivery completion would fail with `PROOF_NOT_READY`. While
 * `FILE_SCAN_SIMULATION` is enabled, this job flips files to `Accepted` after
 * a short grace period so the async-scanning UX stays realistic.
 *
 * Must stay disabled in production (`env.FILE_SCAN_SIMULATION` registers the
 * job only when true).
 */
export const fileScanSimulationJob: JobHandler<FileRow> = {
  name: "file-scan-simulation",
  query: `
    SELECT f.id, f."originalName"
    FROM file_objects f
    WHERE f.status = 'Scanning'
      AND f."uploadedAt" < NOW() - INTERVAL '3 seconds'
    ORDER BY f."uploadedAt" ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  `,
  async claim(tx, row) {
    await tx.fileObject.update({
      where: { id: row.id },
      data: {
        status: "Accepted",
        scanResult: "SIMULATED_SCAN_CLEAN",
        scannedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await writeAudit(
      {
        actorId: null,
        actorType: "system",
        action: "file.scan_completed",
        resourceType: "fileObject",
        resourceId: row.id,
        before: { status: "Scanning" },
        after: { status: "Accepted", scanResult: "SIMULATED_SCAN_CLEAN" },
        requestId: null,
        ip: null,
      },
      tx,
    );

    logger.debug({ fileId: row.id }, "simulated scan marked file Accepted");
  },
};
