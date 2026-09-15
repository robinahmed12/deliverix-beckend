import { prisma } from "../../shared/utils/prisma.js";

/**
 * Acquires a PostgreSQL advisory transaction lock for the given key.
 * Blocks concurrent workers from processing the same logical work item.
 */
export async function acquireJobLock(key: string): Promise<void> {
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * Attempts to acquire a PostgreSQL advisory lock without blocking.
 * Returns true if the lock was obtained (which only happens within a transaction).
 */
export async function tryAcquireJobLock(key: string): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ result: boolean }>>`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS result
  `;
  return result[0]?.result === true;
}