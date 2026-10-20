/**
 * Reads and writes simulated_cost_payments - the stored cost ledger of
 * simulated accounts (see ./ledger). Kept apart from cost_payments so
 * simulated money never reaches real accounting.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SIM_WELCOME_BONUS_NARRATION } from "./config";
import { addDays, parseDayKey } from "./dates";
import type { SimLedgerRow } from "./ledger";

type Tx = Prisma.TransactionClient;

/** The account's live ledger, oldest first. */
export async function loadSimLedger(userId: string): Promise<SimLedgerRow[]> {
  const rows = await prisma.simulatedCostPayment.findMany({
    where: { userId, isDeleted: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      createdAt: true,
      amount: true,
      consumption: true,
      type: true,
      narration: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    type: r.type as SimLedgerRow["type"],
  }));
}

/** Balances of several accounts at once (admin list). */
export async function loadSimBalances(
  userIds: string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const sums = await prisma.simulatedCostPayment.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, isDeleted: false },
    _sum: { amount: true },
  });
  return new Map(sums.map((s) => [s.userId, s._sum.amount ?? 0]));
}

/**
 * Starts (or restarts) an account's ledger at `at`: anything already there
 * is voided, then the welcome bonus is written. Called wherever a simulated
 * account begins - signup, reactivation, conversion.
 */
export async function startSimLedger(
  tx: Tx,
  userId: string,
  at: Date,
  bonusUsd: number,
  actorId: string | null,
): Promise<void> {
  await tx.simulatedCostPayment.updateMany({
    where: { userId, isDeleted: false },
    data: { isDeleted: true },
  });
  // Voided charges keep their chargeDate; free it so the restarted account
  // can be charged for that day again.
  await tx.simulatedCostPayment.updateMany({
    where: { userId, isDeleted: true, chargeDate: { not: null } },
    data: { chargeDate: null },
  });
  if (bonusUsd > 0) {
    await tx.simulatedCostPayment.create({
      data: {
        userId,
        amount: bonusUsd,
        type: "PAYMENT",
        narration: SIM_WELCOME_BONUS_NARRATION,
        createdAt: at,
        createdById: actorId,
      },
    });
  }
}

/**
 * Writes one day's electricity charge, posted at the following 00:00 UTC.
 * Returns false if that day was already charged.
 */
export async function chargeSimDay(input: {
  userId: string;
  day: string;
  amountUsd: number;
  consumptionKwh: number;
}): Promise<boolean> {
  const result = await prisma.simulatedCostPayment.createMany({
    data: [
      {
        userId: input.userId,
        amount: -input.amountUsd,
        consumption: input.consumptionKwh,
        type: "ELECTRICITY_CHARGES",
        chargeDate: parseDayKey(input.day),
        createdAt: addDays(parseDayKey(input.day), 1),
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}
