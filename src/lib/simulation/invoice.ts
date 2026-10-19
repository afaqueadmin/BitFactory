/**
 * A simulated account's hardware + hosting invoice: what a real client is
 * invoiced when they buy a miner - one hardware line and Hosting &
 * Colocation for the first month - built in code on every request and never
 * written to the invoices table. Issued at registration, unpaid, view only.
 *
 * Laid out exactly like a real Hardware Sales invoice (same row labels, so
 * the same PDF). Priced from the CLIENT payback config: hardware = the
 * default invoiced amount, plus Hosting & Colocation at the model's monthly
 * invoicing amount.
 */

import { prisma } from "@/lib/prisma";
import { getOrCreatePaybackConfig } from "@/lib/paybackConfigHelpers";
import { hostingLineItemLabel } from "@/lib/accounting/hostingMonths";
import type { SimContext } from "./context";
import { addDays } from "./dates";

/** The one simulated invoice's id; any other id is "not found". */
export const SIM_INVOICE_ID = "sim-hardware-invoice";

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
    status: "ISSUED" as const,
    invoiceType: "HARDWARE_SALES" as const,
    invoiceGeneratedDate: issued,
    issuedDate: issued,
    dueDate: addDays(issued, DUE_DAYS),
    billingMonth,
    machineHostingLocation: ctx.demoMiner.space.location
      ? [ctx.demoMiner.space.location]
      : [],
    paidDate: null,
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
