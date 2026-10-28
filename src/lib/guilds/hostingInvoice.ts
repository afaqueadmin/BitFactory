/**
 * The guild's hosting invoices - ordinary ELECTRICITY_CHARGES invoices on the
 * Guildmaster's account, priced exactly like any client's (per-miner rate ×
 * power, src/lib/accounting/minerMonthlyHosting.ts). The difference is how
 * they're paid: out of the guild's monthly reward, by the distribution.
 */

import { AuditAction, InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadSuggestedHostingLineItems } from "@/lib/accounting/minerMonthlyHosting";
import { validateStandardLineItems } from "@/lib/accounting/invoiceLineItems";
import { getMinerLocations } from "@/lib/utils/minerLocation";
import {
  INVOICE_NUMBER_CUSTOMER_SELECT,
  nextInvoiceNumber,
} from "@/app/api/accounting/invoices/invoiceNumber";
import type { UnpaidHostingInvoice } from "./distribution";

const OPEN_STATUSES = [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE];

/**
 * The Guildmaster's hosting invoice for `billingMonth`, created (already
 * issued, due on issue - it's prepaid from the reward) when there isn't one.
 * Null when the guild has no running miners to bill.
 */
export async function ensureMonthHostingInvoice(params: {
  guildmasterId: string;
  guildName: string;
  billingMonth: Date;
  createdById: string;
}) {
  const { guildmasterId, guildName, billingMonth, createdById } = params;

  const existing = await prisma.invoice.findFirst({
    where: {
      userId: guildmasterId,
      invoiceType: "ELECTRICITY_CHARGES",
      billingMonth,
      status: { notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED] },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const { miners, lineItems } =
    await loadSuggestedHostingLineItems(guildmasterId);
  const validated = validateStandardLineItems(
    lineItems
      .filter((li) => li.suggestedUnitPrice > 0)
      .map((li) => ({
        hardwareId: li.hardwareId,
        model: li.model,
        quantity: li.quantity,
        unitPrice: li.suggestedUnitPrice,
        lineItemType: "HARDWARE" as const,
      })),
  );
  if ("error" in validated) return null;

  const customer = await prisma.user.findUniqueOrThrow({
    where: { id: guildmasterId },
    select: INVOICE_NUMBER_CUSTOMER_SELECT,
  });
  const now = new Date();
  const invoiceNumber = await nextInvoiceNumber(guildmasterId, customer, now);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      userId: guildmasterId,
      totalMiners: validated.totalMiners,
      unitPrice: validated.unitPrice,
      totalAmount: validated.totalAmount,
      status: InvoiceStatus.ISSUED,
      invoiceType: "ELECTRICITY_CHARGES",
      invoiceGeneratedDate: now,
      issuedDate: now,
      dueDate: now,
      billingMonth,
      machineHostingLocation: getMinerLocations(miners),
      createdBy: createdById,
      lineItems: { create: validated.parentRows },
    },
  });

  await prisma.auditLog.create({
    data: {
      action: AuditAction.INVOICE_CREATED,
      entityType: "Invoice",
      entityId: invoice.id,
      userId: createdById,
      description: `Hosting invoice ${invoice.invoiceNumber} issued for guild ${guildName} (paid from the guild's reward)`,
      changes: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount.toString(),
        billingMonth: billingMonth.toISOString(),
        status: invoice.status,
      }),
    },
  });

  return invoice;
}

/**
 * The guild's unpaid hosting invoices, oldest first, with what's still owed
 * on each. Amounts already earmarked by another not-yet-settled distribution
 * of this guild are taken off, so two months can't both claim them.
 */
export async function loadUnpaidHostingInvoices(params: {
  guildId: string;
  guildmasterId: string;
  excludeDistributionId?: string;
}): Promise<UnpaidHostingInvoice[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      userId: params.guildmasterId,
      invoiceType: "ELECTRICITY_CHARGES",
      status: { in: OPEN_STATUSES },
    },
    include: { costPayments: { where: { isDeleted: false } } },
    orderBy: [
      { billingMonth: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
  });

  const pending = await prisma.guildDistribution.findMany({
    where: {
      guildId: params.guildId,
      status: { in: ["CALCULATED", "HELD"] },
      ...(params.excludeDistributionId
        ? { id: { not: params.excludeDistributionId } }
        : {}),
    },
    select: { hostingAllocations: true },
  });
  const earmarked = new Map<string, number>();
  for (const d of pending) {
    for (const a of parseAllocations(d.hostingAllocations)) {
      earmarked.set(
        a.invoiceId,
        (earmarked.get(a.invoiceId) ?? 0) + a.amountUsd,
      );
    }
  }

  return invoices
    .map((invoice) => {
      const paid = invoice.costPayments.reduce((sum, p) => sum + p.amount, 0);
      const outstanding =
        Number(invoice.totalAmount) - paid - (earmarked.get(invoice.id) ?? 0);
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        outstandingUsd: Math.round(outstanding * 100) / 100,
      };
    })
    .filter((i) => i.outstandingUsd > 0);
}

/** GuildDistribution.hostingAllocations, read back safely. */
export function parseAllocations(
  value: Prisma.JsonValue,
): { invoiceId: string; invoiceNumber: string; amountUsd: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { invoiceId, invoiceNumber, amountUsd } = item as Record<
      string,
      unknown
    >;
    if (typeof invoiceId !== "string" || typeof amountUsd !== "number") {
      return [];
    }
    return [
      {
        invoiceId,
        invoiceNumber: typeof invoiceNumber === "string" ? invoiceNumber : "",
        amountUsd,
      },
    ];
  });
}
