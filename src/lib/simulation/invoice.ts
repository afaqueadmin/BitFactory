/**
 * A simulated account's hardware + hosting invoice: what a real client is
 * invoiced when they buy a miner - one hardware line and Hosting &
 * Colocation for the first month - built in code on every request and never
 * written to the invoices table. Issued and shown as paid at registration, view only.
 * Shown only until an admin issues the account a real invoice (see
 * hasRealIssuedInvoice); from then on its real invoices are shown instead.
 *
 * Laid out exactly like a real Hardware Sales invoice (same row labels, so
 * the same PDF). Priced from the CLIENT payback config: hardware = the
 * default invoiced amount, plus Hosting & Colocation at the model's monthly
 * invoicing amount.
 */

import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreatePaybackConfig } from "@/lib/paybackConfigHelpers";
import { hostingLineItemLabel } from "@/lib/accounting/hostingMonths";
import { SIM_INVOICE_ID } from "./config";
import type { SimContext } from "./context";
import { addDays } from "./dates";

export { SIM_INVOICE_ID };

/**
 * Real invoices that replace the simulated one. Drafts are never shown to a
 * customer, and an account whose real invoices were all cancelled goes back
 * to the simulated one.
 */
export const REAL_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PAID,
];

/** Whether an admin has issued this simulated account a real invoice. */
export async function hasRealIssuedInvoice(userId: string): Promise<boolean> {
  const count = await prisma.invoice.count({
    where: { userId, status: { in: REAL_INVOICE_STATUSES } },
  });
  return count > 0;
}

/**
 * Hardware cost on a simulated account's P&L once it has real invoices: its
 * real Hardware Sales invoices' total, paid or not.
 */
export async function realHardwareInvoicedTotal(
  userId: string,
): Promise<number> {
  const { _sum } = await prisma.invoice.aggregate({
    where: {
      userId,
      invoiceType: "HARDWARE_SALES",
      status: { in: REAL_INVOICE_STATUSES },
    },
    _sum: { totalAmount: true },
  });
  return Number(_sum.totalAmount ?? 0);
}

const DUE_DAYS = 7;

export interface SimInvoicePricing {
  defaultInvoicedAmount: number;
  s21xpMonthlyInvoicingAmount: number;
  s21proMonthlyInvoicingAmount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** First day of the month containing `date`, UTC. */
const monthStart = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

/** "Name-YYYYMMDD-1", the real numbering's fallback for an account with no
 * Luxor subaccount (see accounting/invoices/invoiceNumber.ts). */
function invoiceNumber(name: string | null, issued: Date): string {
  const prefix = name?.trim().split(/\s+/)[0] || "Customer";
  const date = `${issued.getFullYear()}${String(issued.getMonth() + 1).padStart(2, "0")}${String(issued.getDate()).padStart(2, "0")}`;
  return `${prefix}-${date}-1`;
}

export function buildSimInvoice(input: {
  ctx: Pick<SimContext, "userId" | "since" | "demoMiner">;
  user: { name: string | null; email: string };
  pricing: SimInvoicePricing;
}) {
  const { ctx, user, pricing } = input;
  const hw = ctx.demoMiner.hardware;
  const isXp = /xp/i.test(hw.model);
  const hosting = round2(
    isXp
      ? pricing.s21xpMonthlyInvoicingAmount
      : pricing.s21proMonthlyInvoicingAmount,
  );
  const hardware = round2(pricing.defaultInvoicedAmount);
  const total = round2(hardware + hosting);
  const issued = ctx.since;
  const billingMonth = monthStart(issued);

  const lineItem = (
    suffix: string,
    lineItemType: "HARDWARE" | "HOSTING_COLOCATION",
    unitPrice: number,
    month: Date | null,
  ) => ({
    id: `${SIM_INVOICE_ID}-${suffix}`,
    invoiceId: SIM_INVOICE_ID,
    hardwareId: hw.id,
    // Real hosting rows store their full label (see LineItemsEditor), and
    // the PDF prints this field as the product name.
    model: month ? hostingLineItemLabel(hw.model, month) : hw.model,
    quantity: 1,
    unitPrice,
    totalPrice: unitPrice,
    lineItemType,
    billingMonth: month,
    parentLineItemId: null,
    createdAt: issued,
    updatedAt: issued,
  });

  return {
    id: SIM_INVOICE_ID,
    invoiceNumber: invoiceNumber(user.name, issued),
    userId: ctx.userId,
    hardwareId: hw.id,
    totalMiners: 1,
    unitPrice: hardware,
    totalAmount: total,
    status: "PAID" as const,
    invoiceType: "HARDWARE_SALES" as const,
    invoiceGeneratedDate: issued,
    issuedDate: issued,
    dueDate: addDays(issued, DUE_DAYS),
    billingMonth,
    machineHostingLocation: ctx.demoMiner.space.location
      ? [ctx.demoMiner.space.location]
      : [],
    paidDate: issued,
    discountAmount: 0,
    minerId: null,
    miner: null,
    repairNote: null,
    createdAt: issued,
    updatedAt: issued,
    user: { id: ctx.userId, name: user.name, email: user.email },
    costPayments: [],
    lineItems: [
      lineItem("hardware", "HARDWARE", hardware, null),
      lineItem("hosting", "HOSTING_COLOCATION", hosting, billingMonth),
    ],
  };
}

export type SimInvoice = ReturnType<typeof buildSimInvoice>;

export async function loadSimInvoice(ctx: SimContext): Promise<SimInvoice> {
  const [config, user] = await Promise.all([
    getOrCreatePaybackConfig("CLIENT"),
    prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { name: true, email: true },
    }),
  ]);
  return buildSimInvoice({
    ctx,
    user,
    pricing: {
      defaultInvoicedAmount: Number(config.defaultInvoicedAmount),
      s21xpMonthlyInvoicingAmount: Number(config.s21xpMonthlyInvoicingAmount),
      s21proMonthlyInvoicingAmount: Number(config.s21proMonthlyInvoicingAmount),
    },
  });
}
