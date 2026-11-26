import { prisma } from "@/lib/prisma";
import { NON_BALANCE_PAYMENT_TYPES } from "@/lib/accounting/paymentTypes";
import { franchiseeUserFilter } from "@/lib/franchiseeScope";
import { getDepositBalances } from "@/lib/accounting/vendorDeposit";

/**
 * Company totals for the admin dashboard finance and balance cards, computed
 * on the server so a role can see a card without the module's list APIs.
 */

/** Issued hosting invoices (ISSUED/OVERDUE/PROCESSING/PAID) minus issued hosting memos. */
export async function hostingRevenue(): Promise<number> {
  const [invoices, credits] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        invoiceType: "ELECTRICITY_CHARGES",
        status: { in: ["ISSUED", "OVERDUE", "PROCESSING", "PAID"] },
      },
      _sum: { totalAmount: true },
    }),
    // Memos net out of the invoice total rather than mutating Invoice rows,
    // so issued invoices stay an immutable record.
    prisma.memo.aggregate({
      where: { category: "HOSTING", status: "ISSUED" },
      _sum: { amount: true },
    }),
  ]);
  return (
    Number(invoices._sum.totalAmount ?? 0) - Number(credits._sum.amount ?? 0)
  );
}

/** Payments on Hardware Sales and Repair invoices minus issued hardware memos. */
export async function hardwareRevenue(): Promise<number> {
  const [payments, credits] = await Promise.all([
    prisma.costPayment.aggregate({
      where: {
        type: { in: ["HARDWARE_SALES", "HARDWARE_REPAIR"] },
        isDeleted: false,
      },
      _sum: { amount: true },
    }),
    prisma.memo.aggregate({
      where: { category: "HARDWARE", status: "ISSUED" },
      _sum: { amount: true },
    }),
  ]);
  return (payments._sum.amount ?? 0) - Number(credits._sum.amount ?? 0);
}

/** Vendor (farm tariff) invoices that aren't Cancelled. */
export async function hostingCost(): Promise<number> {
  const r = await prisma.vendorInvoice.aggregate({
    where: { paymentStatus: { not: "Cancelled" } },
    _sum: { totalAmount: true },
  });
  return Number(r._sum.totalAmount ?? 0);
}

/** Hardware purchases that aren't Cancelled; the refundable deposit is not a cost. */
export async function hardwareCost(): Promise<number> {
  const r = await prisma.hardwarePurchaseInvoice.aggregate({
    where: { paymentStatus: { not: "Cancelled" } },
    _sum: { totalAmount: true, securityDeposit: true },
  });
  return Number(r._sum.totalAmount ?? 0) - Number(r._sum.securityDeposit ?? 0);
}

/** Hardware Sales and Repair invoices not yet paid. */
export async function hardwareRevenuePending(): Promise<number> {
  const r = await prisma.invoice.aggregate({
    where: {
      invoiceType: { in: ["HARDWARE_SALES", "HARDWARE_REPAIR"] },
      status: { in: ["DRAFT", "ISSUED", "OVERDUE", "PROCESSING"] },
    },
    _sum: { totalAmount: true },
  });
  return Number(r._sum.totalAmount ?? 0);
}

/** Security deposits vendors still hold, all vendors (same as the Security Deposits page total). */
export async function securityDepositOutstanding(): Promise<number> {
  let total = 0;
  for (const b of (await getDepositBalances()).values())
    total += Number(b.outstanding);
  return total;
}

/**
 * Customer balances split into positive and negative, with counts. Test
 * accounts are left out; a FRANCHISEE sees only its own customers.
 */
export async function customerBalanceTotals(currentUser: {
  id: string;
  role: string;
}) {
  const costPayments = await prisma.costPayment.groupBy({
    by: ["userId"],
    where: { type: { notIn: NON_BALANCE_PAYMENT_TYPES }, isDeleted: false },
    _sum: { amount: true },
  });
  const users = await prisma.user.findMany({
    where: {
      id: { in: costPayments.map((p) => p.userId) },
      isDeleted: false,
      poolAuths: { none: { authKey: { contains: "higgs_test" } } },
      ...franchiseeUserFilter(currentUser),
    },
    select: { id: true },
  });
  const included = new Set(users.map((u) => u.id));

  let totalPositiveBalance = 0;
  let totalNegativeBalance = 0;
  let positiveCustomerCount = 0;
  let negativeCustomerCount = 0;
  for (const p of costPayments) {
    if (!included.has(p.userId)) continue;
    const balance = Number(p._sum.amount!.toFixed(2));
    if (balance >= 0) {
      totalPositiveBalance += balance;
      positiveCustomerCount += 1;
    } else {
      totalNegativeBalance += balance;
      negativeCustomerCount += 1;
    }
  }
  return {
    totalPositiveBalance,
    totalNegativeBalance,
    positiveCustomerCount,
    negativeCustomerCount,
  };
}
