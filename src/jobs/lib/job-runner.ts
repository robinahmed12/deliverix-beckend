import { prisma } from "../../shared/utils/prisma.js";
import { logger } from "../../shared/utils/logger.js";
import type { Prisma } from "../../generated/prisma/client.js";

export type Tx = Prisma.TransactionClient;

export interface ClaimableRow {
  id: string;
}

export interface JobHandler<TRow extends ClaimableRow> {
  name: string;
  /**
   * SQL query that selects claimable rows.
   * MUST include `FOR UPDATE SKIP LOCKED` and a trailing `LIMIT $1` placeholder.
   */
  query: string;
  /** Processes a claimed row using the transaction that holds the row lock. */
  claim: (tx: Tx, row: TRow) => Promise<void>;
}

export type JobRunnerOptions = {
  batchSize?: number;
  onError?: ((name: string, error: unknown) => void) | undefined;
};

/**
 * PostgreSQL polling job runner with claim semantics (JOB-004).
 *
 * Each run claims a batch of rows with `FOR UPDATE SKIP LOCKED` inside a single
 * transaction, processes them, and commits. Retries are handled by the claim
 * handlers via the row's attempts/backoff columns. Failed handlers leave the
 * transaction to roll back so rows remain claimable (JOB-001, JOB-002).
 */
export class JobRunner {
  private readonly batchSize: number;
  private readonly onError: ((name: string, error: unknown) => void) | undefined;

  constructor(options?: JobRunnerOptions) {
    this.batchSize = options?.batchSize ?? 20;
    this.onError = options?.onError ?? undefined;
  }

  async runOnce<TRow extends ClaimableRow>(handler: JobHandler<TRow>): Promise<number> {
    const traceId = `${handler.name}-${Date.now()}`;
    try {
      const claimed = await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRawUnsafe<TRow[]>(handler.query, this.batchSize);
          for (const row of rows) {
            await handler.claim(tx, row);
          }
          return rows.length;
        },
        { timeout: 60_000 },
      );
      if (claimed > 0) {
        logger.debug({ job: handler.name, claimed, traceId }, "job run complete");
      }
      return claimed;
    } catch (error) {
      this.recordError(handler.name, error);
      return 0;
    }
  }

  private recordError(name: string, error: unknown): void {
    if (this.onError) {
      this.onError(name, error);
    } else {
      logger.error({ err: error, job: name }, "job handler error");
    }
  }
}