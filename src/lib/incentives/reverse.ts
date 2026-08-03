/**
 * Reverses previously accrued incentive entries when their source invoice is
 * cancelled or refunded. If an entry was already paid out to the franchisee
 * (payoutBatchId set), a negative clawback entry is created instead of just
 * voiding it, so it nets against that franchisee's next payout.
 *
 * See src/lib/incentives/accrue.ts for the corresponding accrual logic.
 */

import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";

export async function reverseIncentivesForInvoice(
  invoiceId: string,
  actingUserId: string,
  reason: string,
): Promise<void> {
  try {
    const entries = await prisma.incentiveEntry.findMany({
      where: { sourceInvoiceId: invoiceId, status: "ACCRUED" },
    });

    for (const entry of entries) {
      await prisma.incentiveEntry.update({
        where: { id: entry.id },
        data: {
          status: "REVERSED",
          reversedAt: new Date(),
          reversedReason: reason,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: AuditAction.INCENTIVE_REVERSED,
          entityType: "IncentiveEntry",
          entityId: entry.id,
          userId: actingUserId,
          description: `Incentive entry ${entry.id} reversed: ${reason}`,
          changes: JSON.stringify({ reason }),
        },
      });

      if (entry.payoutBatchId) {
        const clawbackAmount = -Number(entry.amount);
        const clawback = await prisma.incentiveEntry.create({
          data: {
            franchiseId: entry.franchiseId,
            incentiveType: entry.incentiveType,
            rateId: entry.rateId,
            sourceInvoiceId: null,
            sourceInvoiceNumber: `${entry.sourceInvoiceNumber} (clawback)`,
            clientUserId: entry.clientUserId,
            basisAmount: entry.basisAmount,
            rateApplied: entry.rateApplied,
            amount: clawbackAmount,
            accrualDate: new Date(),
            billingPeriod: entry.billingPeriod,
            adjustsEntryId: entry.id,
          },
        });

        await prisma.auditLog.create({
          data: {
            action: AuditAction.INCENTIVE_CLAWBACK_CREATED,
            entityType: "IncentiveEntry",
            entityId: clawback.id,
            userId: actingUserId,
            description: `Clawback of ${clawbackAmount} created for franchise ${entry.franchiseId}, offsetting already-paid entry ${entry.id}`,
            changes: JSON.stringify({
              adjustsEntryId: entry.id,
              amount: clawbackAmount.toString(),
            }),
          },
        });
      }
    }
  } catch (error) {
    console.error(
      `[incentives] Failed to reverse incentives for invoice ${invoiceId}:`,
      error,
    );
  }
}
