/**
 * "You've been paid" wallet snapshot emails (cron_wallet_payment_email).
 *
 * A payout is detected from what actually happened, never from a schedule:
 * a Luxor "Payment" debit in pool_transactions (written by
 * cron_pool_worker_transactions), or a simulated account's computed monthly
 * payout. That covers daily, weekly and monthly payment frequencies alike,
 * and a payout Luxor skipped (balance below the minimum) is never announced.
 *
 * One email per customer per payout day, however many of their subaccounts
 * were paid, tracked in wallet_payment_emails so reruns never resend.
 */

import { prisma } from "@/lib/prisma";
import { secondaryLoginEmails } from "@/lib/auth/loginIdentity";
import {
  launchPdfBrowser,
  sendWalletSnapshotEmail,
  type PdfBrowser,
} from "@/lib/email";
import {
  payoutEmailBody,
  payoutEmailSubject,
} from "@/lib/email-templates/wallet-snapshot-email";
import {
  findLuxorSubaccountsForSync,
  formatUtcDateKey,
  syncSubaccountTransactions,
  type RangeResult,
} from "@/lib/services/poolWorkerAndTransactionService";
import { sleep, SUBACCOUNT_SPACING_MS } from "@/lib/services/cronRetry";
import { getSimContext } from "@/lib/simulation/context";
import { loadSimPoolLedger } from "@/lib/simulation/data";
import { DEFAULT_PAYOUT_CATEGORIES } from "@/lib/simulation/payouts";
import { SIM_SUBACCOUNT_NAME } from "@/lib/simulation/config";
import {
  renderWalletSnapshotPdf,
  walletSnapshotFilename,
} from "@/lib/walletSnapshot";

/** Payout days considered: today and the 3 days before it (UTC). Older
 * payouts are never emailed, so a first deploy doesn't announce old ones. */
const WINDOW_DAYS = 3;
/** A FAILED email is retried on later runs until it has failed this often. */
const MAX_ATTEMPTS = 3;
/** Stop starting new emails after this long, inside the 300s limit; the
 * next hourly run carries on with whoever is left. */
const SEND_BUDGET_MS = 240_000;
/** Same budget for the Luxor fallback, so it can't starve the emails. */
const FALLBACK_BUDGET_MS = 90_000;
/** Lookback used to tell a subaccount the nightly sync missed apart from
 * one that simply never has transactions (no miners). */
const ACTIVE_LOOKBACK_DAYS = 7;
/** Copied on every automatic payout email. */
const DEVELOPER_CC = "webdeveloper.sas@gmail.com";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_CATEGORY = DEFAULT_PAYOUT_CATEGORIES.payment;

const utcMidnight = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

export interface PayoutCandidate {
  userId: string;
  name: string | null;
  email: string;
  source: "luxor" | "simulated";
  /** UTC midnight of the payout day. */
  payoutDate: Date;
  totalBtc: number;
  subaccounts: { name: string; btc: number }[];
}

export interface WalletPaymentEmailRunResult {
  window: { start: string; end: string };
  dryRun: boolean;
  /** One line per subaccount fetched live from Luxor because the nightly
   * sync missed it (on a dry run: that would have been). */
  fallback: string[];
  candidates: Array<{
    userId: string;
    email: string;
    source: string;
    payoutDate: string;
    totalBtc: number;
    subaccounts: string[];
    state: "pending" | "already-sent" | "gave-up";
  }>;
  sent: string[];
  failed: Array<{ email: string; payoutDate: string; error: string }>;
  deferred: string[];
  errors: string[];
}

/**
 * Luxor fallback: subaccounts with transactions in the week before
 * yesterday but none dated yesterday were most likely missed by
 * cron_pool_worker_transactions - fetch those live and store them, exactly
 * as that cron would have. Subaccounts with no recent transactions at all
 * (no miners) are left alone, so they aren't refetched every run.
 */
async function findMissedSubaccounts(today: Date) {
  const yesterday = new Date(today.getTime() - DAY_MS);
  const lookbackStart = new Date(
    yesterday.getTime() - ACTIVE_LOOKBACK_DAYS * DAY_MS,
  );
  const subaccounts = await findLuxorSubaccountsForSync();
  const ids = subaccounts.map((s) => s.id);

  const [recent, latest] = await Promise.all([
    prisma.poolTransaction.groupBy({
      by: ["poolSubaccountId"],
      where: {
        poolSubaccountId: { in: ids },
        occurredAt: { gte: lookbackStart, lt: yesterday },
      },
    }),
    prisma.poolTransaction.groupBy({
      by: ["poolSubaccountId"],
      where: {
        poolSubaccountId: { in: ids },
        occurredAt: { gte: yesterday, lt: today },
      },
    }),
  ]);
  const hadRecent = new Set(recent.map((r) => r.poolSubaccountId));
  const hasYesterday = new Set(latest.map((r) => r.poolSubaccountId));
  return subaccounts.filter(
    (s) => hadRecent.has(s.id) && !hasYesterday.has(s.id),
  );
}

/** Real clients' Luxor payouts in the window, one per (user, UTC day). */
async function findLuxorPayouts(
  windowStart: Date,
  windowEnd: Date,
): Promise<PayoutCandidate[]> {
  const rows = await prisma.poolTransaction.findMany({
    where: {
      category: PAYMENT_CATEGORY,
      transactionType: "debit",
      pool: { name: "Luxor" },
      occurredAt: { gte: windowStart, lt: windowEnd },
      poolSubaccount: { user: { role: "CLIENT", isDeleted: false } },
    },
    select: {
      amount: true,
      occurredAt: true,
      poolSubaccount: {
        select: {
          subaccountName: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  const byKey = new Map<string, PayoutCandidate>();
  for (const row of rows) {
    const user = row.poolSubaccount.user;
    if (!user) continue;
    const payoutDate = utcMidnight(row.occurredAt);
    const key = `${user.id}|${payoutDate.toISOString()}`;
    const btc = Math.abs(Number(row.amount));
    let candidate = byKey.get(key);
    if (!candidate) {
      candidate = {
        userId: user.id,
        name: user.name,
        email: user.email,
        source: "luxor",
        payoutDate,
        totalBtc: 0,
        subaccounts: [],
      };
      byKey.set(key, candidate);
    }
    candidate.totalBtc += btc;
    const sub = candidate.subaccounts.find(
      (s) => s.name === row.poolSubaccount.subaccountName,
    );
    if (sub) sub.btc += btc;
    else
      candidate.subaccounts.push({
        name: row.poolSubaccount.subaccountName,
        btc,
      });
  }
  return [...byKey.values()];
}

/** Active simulated accounts' computed payouts in the window. */
async function findSimulatedPayouts(
  windowStart: Date,
  windowEnd: Date,
  errors: string[],
): Promise<PayoutCandidate[]> {
  const users = await prisma.user.findMany({
    where: { role: "SIMULATED", isDeleted: false },
    select: { id: true, name: true, email: true, role: true },
  });

  const candidates: PayoutCandidate[] = [];
  for (const user of users) {
    try {
      const ctx = await getSimContext({ userId: user.id, role: user.role });
      if (!ctx) continue;
      const ledger = await loadSimPoolLedger(ctx);
      const byDay = new Map<string, PayoutCandidate>();
      for (const tx of ledger.transactions) {
        if (
          tx.transaction_type !== "debit" ||
          tx.transaction_category !== PAYMENT_CATEGORY
        ) {
          continue;
        }
        const at = new Date(tx.date_time);
        if (at < windowStart || at >= windowEnd) continue;
        const payoutDate = utcMidnight(at);
        const key = payoutDate.toISOString();
        const btc = Math.abs(tx.currency_amount);
        const existing = byDay.get(key);
        if (existing) {
          existing.totalBtc += btc;
          existing.subaccounts[0].btc += btc;
        } else {
          byDay.set(key, {
            userId: user.id,
            name: user.name,
            email: user.email,
            source: "simulated",
            payoutDate,
            totalBtc: btc,
            subaccounts: [{ name: SIM_SUBACCOUNT_NAME, btc }],
          });
        }
      }
      candidates.push(...byDay.values());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Simulated ${user.email}: ${message}`);
    }
  }
  return candidates;
}

/**
 * One run of the payout email cron. `now` is the run time (overridable for
 * testing); `onlyUserId` limits sending to one customer; `dryRun` reports
 * what would happen without fetching from Luxor, rendering or sending.
 */
export async function runWalletPaymentEmails(options: {
  now: Date;
  startedAt: number;
  dryRun?: boolean;
  onlyUserId?: string | null;
}): Promise<WalletPaymentEmailRunResult> {
  const { now, startedAt, dryRun = false, onlyUserId = null } = options;
  const today = utcMidnight(now);
  const windowStart = new Date(today.getTime() - WINDOW_DAYS * DAY_MS);
  const windowEnd = new Date(today.getTime() + DAY_MS);
  const errors: string[] = [];

  // 1. Luxor fallback for subaccounts the nightly sync missed.
  const missed = await findMissedSubaccounts(today);
  const fallback: string[] = [];
  if (dryRun) {
    fallback.push(...missed.map((s) => `${s.subaccountName}: would fetch`));
  } else {
    const yesterdayKey = formatUtcDateKey(new Date(today.getTime() - DAY_MS));
    for (const [index, sub] of missed.entries()) {
      if (Date.now() - startedAt > FALLBACK_BUDGET_MS) {
        errors.push(
          `Luxor fallback stopped for time; skipped ${missed.length - index} subaccount(s)`,
        );
        break;
      }
      if (index > 0) await sleep(SUBACCOUNT_SPACING_MS);
      const r: RangeResult = await syncSubaccountTransactions(
        sub,
        formatUtcDateKey(windowStart),
        yesterdayKey,
      );
      fallback.push(
        `${r.subaccountName}: ${r.status} (${r.written} written${r.error ? `, ${r.error}` : ""})`,
      );
    }
  }

  // 2. Payouts in the window, real and simulated.
  const [luxor, simulated] = await Promise.all([
    findLuxorPayouts(windowStart, windowEnd),
    findSimulatedPayouts(windowStart, windowEnd, errors),
  ]);
  let candidates = [...luxor, ...simulated].sort(
    (a, b) => a.payoutDate.getTime() - b.payoutDate.getTime(),
  );
  if (onlyUserId) {
    candidates = candidates.filter((c) => c.userId === onlyUserId);
  }

  // 3. What's already been emailed.
  const existing = candidates.length
    ? await prisma.walletPaymentEmail.findMany({
        where: {
          userId: { in: [...new Set(candidates.map((c) => c.userId))] },
          payoutDate: { gte: windowStart, lt: windowEnd },
        },
      })
    : [];
  const existingByKey = new Map(
    existing.map((e) => [`${e.userId}|${e.payoutDate.toISOString()}`, e]),
  );
  const stateOf = (c: PayoutCandidate) => {
    const row = existingByKey.get(`${c.userId}|${c.payoutDate.toISOString()}`);
    if (row?.status === "SENT") return "already-sent" as const;
    if (row && row.attempts >= MAX_ATTEMPTS) return "gave-up" as const;
    return "pending" as const;
  };

  const result: WalletPaymentEmailRunResult = {
    window: {
      start: formatUtcDateKey(windowStart),
      end: formatUtcDateKey(today),
    },
    dryRun,
    fallback,
    candidates: candidates.map((c) => ({
      userId: c.userId,
      email: c.email,
      source: c.source,
      payoutDate: formatUtcDateKey(c.payoutDate),
      totalBtc: Number(c.totalBtc.toFixed(8)),
      subaccounts: c.subaccounts.map((s) => s.name),
      state: stateOf(c),
    })),
    sent: [],
    failed: [],
    deferred: [],
    errors,
  };

  const pending = candidates.filter((c) => stateOf(c) === "pending");
  if (dryRun || pending.length === 0) return result;

  // 4. Render and send, one at a time, in one shared browser.
  const testTo = process.env.WALLET_PAYMENT_EMAIL_TEST_TO?.trim() || null;
  let browser: PdfBrowser | null = null;
  try {
    for (const candidate of pending) {
      const label = `${candidate.email} (${formatUtcDateKey(candidate.payoutDate)})`;
      if (Date.now() - startedAt > SEND_BUDGET_MS) {
        result.deferred.push(label);
        continue;
      }

      const to = testTo ?? candidate.email;
      const cc = testTo
        ? []
        : [
            ...(await secondaryLoginEmails(candidate.userId)),
            DEVELOPER_CC,
          ].filter((e) => e.toLowerCase() !== to.toLowerCase());

      let error: string | null = null;
      try {
        if (!browser || !browser.connected) {
          await browser?.close().catch(() => {});
          browser = await launchPdfBrowser();
        }
        const pdfBuffer = await renderWalletSnapshotPdf(
          candidate.userId,
          browser,
          { customerName: candidate.name, payoutDate: candidate.payoutDate },
        );
        const details = {
          customerName: candidate.name || "Valued Customer",
          payoutDate: candidate.payoutDate,
          totalBtc: candidate.totalBtc,
          subaccounts: candidate.subaccounts,
          isSimulated: candidate.source === "simulated",
        };
        const sendResult = await sendWalletSnapshotEmail({
          email: to,
          ccEmails: cc,
          subject: payoutEmailSubject(details),
          body: payoutEmailBody(details),
          pdfBuffer,
          pdfFilename: walletSnapshotFilename(candidate.name),
        });
        if (!sendResult.success) {
          error =
            sendResult.error instanceof Error
              ? sendResult.error.message
              : "Email send failed";
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }

      const key = {
        userId_payoutDate: {
          userId: candidate.userId,
          payoutDate: candidate.payoutDate,
        },
      };
      const payoutBtc = candidate.totalBtc.toFixed(8);
      try {
        // A test send (redirected to WALLET_PAYMENT_EMAIL_TEST_TO) is never
        // recorded, so it can't stop the customer's real email later.
        if (!testTo)
          await prisma.walletPaymentEmail.upsert({
            where: key,
            create: {
              userId: candidate.userId,
              payoutDate: candidate.payoutDate,
              source: candidate.source,
              payoutBtc,
              status: error ? "FAILED" : "SENT",
              attempts: 1,
              lastError: error,
              sentTo: to,
              ccEmails: cc.join(","),
              sentAt: error ? null : new Date(),
            },
            update: {
              payoutBtc,
              status: error ? "FAILED" : "SENT",
              attempts: { increment: 1 },
              lastError: error,
              sentTo: to,
              ccEmails: cc.join(","),
              sentAt: error ? null : new Date(),
            },
          });
      } catch (dbError) {
        errors.push(
          `Could not record ${label}: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
        );
      }

      if (error) {
        result.failed.push({
          email: candidate.email,
          payoutDate: formatUtcDateKey(candidate.payoutDate),
          error,
        });
      } else {
        result.sent.push(testTo ? `${label} [test: sent to ${to}]` : label);
      }
    }
  } finally {
    await (browser as PdfBrowser | null)?.close().catch(() => {});
  }

  return result;
}
