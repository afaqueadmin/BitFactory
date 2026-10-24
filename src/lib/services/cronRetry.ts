/**
 * Retry/backoff helper for the pool-history crons only — NOT used by
 * luxor.ts/braiins.ts themselves, so live user-facing requests (e.g. a
 * client loading /miners) keep failing fast on a 429 rather than sitting
 * through a multi-second retry chain. Crons can afford to be patient; page
 * loads can't.
 *
 * Mirrors the exponential-backoff pattern already proven in the one-off
 * backfill/gapfill scripts (scripts/backfill-pool-history.js etc.), just
 * adapted to catch LuxorError/BraiinsError's `statusCode` instead of raw
 * axios error shapes.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LuxorError } from "@/lib/luxor";
import { BraiinsError } from "@/lib/braiins";

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

const isRateLimited = (error: unknown): boolean =>
  (error instanceof LuxorError || error instanceof BraiinsError) &&
  error.statusCode === 429;

/**
 * Runs `fn`, retrying with exponential backoff only on a 429 from Luxor or
 * Braiins. Any other error (401, 500, network failure, etc.) is rethrown
 * immediately — retrying those wouldn't help and would just waste the
 * cron's execution time budget.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimited(error) || attempt >= RETRY_DELAYS_MS.length) {
        throw error;
      }
      const delayMs = RETRY_DELAYS_MS[attempt];
      console.warn(
        `[Cron Retry] ${label}: rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
}

const DB_RETRY_DELAYS_MS = [5000, 10000, 20000];

/**
 * Pings the database, retrying only on a connection failure
 * (PrismaClientInitializationError). An idle Neon compute can take longer to
 * wake than Prisma's connect timeout, so a cron's first query fails with
 * "Can't reach database server" — cron_pool_worker_transactions died that way
 * on every 04:00 UTC run from 2026-10-20, before writing anything or sending
 * its summary email. Call this before a cron's first real query.
 */
export async function waitForDatabase(label: string): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientInitializationError) ||
        attempt >= DB_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      const delayMs = DB_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[Cron Retry] ${label}: database unreachable, retrying in ${delayMs}ms (attempt ${attempt + 1}/${DB_RETRY_DELAYS_MS.length})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
}

/** Delay between subaccounts in a cron's sequential loop, spreading out
 * request bursts against Luxor's shared per-key rate limit. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const SUBACCOUNT_SPACING_MS = 500;

/**
 * Test/non-production subaccounts to skip in every pool-history cron —
 * belt-and-suspenders alongside the `poolAuthId: { not: null }` filter
 * (which already excludes them once their PoolAuth is unassigned, but a
 * name-based list still protects against one being reassigned later for
 * more testing).
 */
export const EXCLUDED_SUBACCOUNTS = new Set([
  "higgs_test",
  "higgs_test2",
  "higgs_test3",
]);
