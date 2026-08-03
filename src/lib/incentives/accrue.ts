/**
 * Computes and records franchisee incentive earnings when a source invoice
 * transitions to ISSUED. Never throws back into the invoice-issue flow — a
 * bug in incentive math must never block issuing a customer invoice.
 *
 * See src/lib/incentives/reverse.ts for the corresponding reversal/clawback
 * logic when a source invoice is later cancelled or refunded.
 */

import { prisma } from "@/lib/prisma";
import { getOwnFranchise } from "@/lib/franchiseeScope";
import {
  AuditAction,
  IncentiveType,
  type FranchiseIncentiveRate,
  type Invoice,
  type InvoiceLineItem,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

type InvoiceWithDetails = Invoice & {
  user: { id: string; role: string; franchiseeId: string | null };
  lineItems: InvoiceLineItem[];
};

async function resolveActiveRate(
  franchiseId: string,
  incentiveType: IncentiveType,
  atDate: Date,
): Promise<FranchiseIncentiveRate | null> {
  return prisma.franchiseIncentiveRate.findFirst({
    where: {
      franchiseId,
      incentiveType,
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: atDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

async function createEntry(
  invoice: InvoiceWithDetails,
  franchiseId: string,
  incentiveType: IncentiveType,
  rate: FranchiseIncentiveRate,
  basisAmount: number,
  rateApplied: number,
  amount: number,
  clientUserId: string | null,
  actingUserId: string,
) {
  try {
    const entry = await prisma.incentiveEntry.create({
      data: {
        franchiseId,
        incentiveType,
        rateId: rate.id,
        sourceInvoiceId: invoice.id,
        sourceInvoiceNumber: invoice.invoiceNumber,
        clientUserId,
        basisAmount,
        rateApplied,
        amount,
        accrualDate: invoice.issuedDate ?? new Date(),
        billingPeriod: invoice.billingMonth,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCENTIVE_ACCRUED,
        entityType: "IncentiveEntry",
        entityId: entry.id,
        userId: actingUserId,
        description: `Incentive ${incentiveType} of ${amount} accrued for franchise ${franchiseId} from invoice ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          incentiveType,
          sourceInvoiceId: invoice.id,
          amount: amount.toString(),
        }),
      },
    });
  } catch (error) {
    // Unique constraint on [sourceInvoiceId, incentiveType] — already accrued, skip.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

async function accrueHardwareSale(
  invoice: InvoiceWithDetails,
  franchiseId: string,
  actingUserId: string,
) {
  const issuedAt = invoice.issuedDate ?? new Date();
  const rate = await resolveActiveRate(
    franchiseId,
    IncentiveType.HARDWARE_SALE,
    issuedAt,
  );
  if (!rate) return;

  const totalAmount = Number(invoice.totalAmount);

  if (rate.rateBasis === "FLAT_PER_UNIT" && rate.flatAmount != null) {
    const units =
      invoice.lineItems.length > 0
        ? invoice.lineItems.reduce((sum, li) => sum + li.quantity, 0)
        : invoice.totalMiners;
    const flatAmount = Number(rate.flatAmount);
    await createEntry(
      invoice,
      franchiseId,
      IncentiveType.HARDWARE_SALE,
      rate,
      units,
      flatAmount,
      flatAmount * units,
      invoice.user.id,
      actingUserId,
    );
  } else if (rate.rateBasis === "PERCENTAGE" && rate.percentage != null) {
    const percentage = Number(rate.percentage);
    await createEntry(
      invoice,
      franchiseId,
      IncentiveType.HARDWARE_SALE,
      rate,
      totalAmount,
      percentage,
      (totalAmount * percentage) / 100,
      invoice.user.id,
      actingUserId,
    );
  }
}

async function accrueOwnMachineRebate(
  invoice: InvoiceWithDetails,
  franchiseId: string,
  actingUserId: string,
) {
  const issuedAt = invoice.issuedDate ?? new Date();
  const rate = await resolveActiveRate(
    franchiseId,
    IncentiveType.OWN_MACHINE_HOSTING_REBATE,
    issuedAt,
  );
  if (!rate || rate.flatAmount == null) return;

  const flatAmount = Number(rate.flatAmount);
  await createEntry(
    invoice,
    franchiseId,
    IncentiveType.OWN_MACHINE_HOSTING_REBATE,
    rate,
    invoice.totalMiners,
    flatAmount,
    flatAmount * invoice.totalMiners,
    null,
    actingUserId,
  );
}

async function accrueClientCommission(
  invoice: InvoiceWithDetails,
  franchiseId: string,
  actingUserId: string,
) {
  const issuedAt = invoice.issuedDate ?? new Date();
  const rate = await resolveActiveRate(
    franchiseId,
    IncentiveType.CLIENT_HOSTING_COMMISSION,
    issuedAt,
  );
  if (!rate || rate.percentage == null) return;

  const totalAmount = Number(invoice.totalAmount);
  const percentage = Number(rate.percentage);
  await createEntry(
    invoice,
    franchiseId,
    IncentiveType.CLIENT_HOSTING_COMMISSION,
    rate,
    totalAmount,
    percentage,
    (totalAmount * percentage) / 100,
    invoice.user.id,
    actingUserId,
  );
}

export async function accrueIncentivesForInvoice(
  invoiceId: string,
  actingUserId: string,
): Promise<void> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: { select: { id: true, role: true, franchiseeId: true } },
        lineItems: true,
      },
    });

    if (!invoice || invoice.status !== "ISSUED") return;

    if (invoice.invoiceType === "HARDWARE_SALES") {
      // Only genuine downstream clients earn the hardware-sale incentive —
      // not hardware the franchisee buys for their own rig.
      if (invoice.user.franchiseeId) {
        await accrueHardwareSale(
          invoice,
          invoice.user.franchiseeId,
          actingUserId,
        );
      }
    } else if (invoice.invoiceType === "ELECTRICITY_CHARGES") {
      if (invoice.user.role === "FRANCHISEE") {
        const ownFranchise = await getOwnFranchise(invoice.user.id);
        if (ownFranchise) {
          await accrueOwnMachineRebate(invoice, ownFranchise.id, actingUserId);
        }
      } else if (invoice.user.franchiseeId) {
        await accrueClientCommission(
          invoice,
          invoice.user.franchiseeId,
          actingUserId,
        );
      }
    }
  } catch (error) {
    console.error(
      `[incentives] Failed to accrue incentives for invoice ${invoiceId}:`,
      error,
    );
  }
}
