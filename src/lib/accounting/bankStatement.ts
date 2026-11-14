import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  buildStatement,
  customerInvoiceHref,
  customerPaymentTypeLabel,
  feeUsd,
  floatUsd,
  formatOriginal,
  isPartial,
  joinNote,
  SiblingPayment,
  splitNote,
  Statement,
  StatementRow,
  usd,
  VendorKind,
  vendorInvoiceHref,
  vendorKindLabel,
  vendorReceiptHref,
} from "@/lib/accounting/bankStatementRows";
import { transferStatementRows } from "@/lib/accounting/bankTransfer";
import { expenseStatementRows } from "@/lib/accounting/expense";

/**
 * Bank balances and statements, read from the five tables that save a bank
 * (see bankStatementRows.ts). Debit = money in, Credit = money out, all in
 * the USD value saved with each payment.
 *
 * Left out on purpose: voided customer payments (isDeleted), zero-amount
 * "Mark as Paid" rows, deposit ADJUSTMENTs (no cash, no bank). The
 * deprecated single-currency payment columns on vendor invoices are not
 * read: those payments were backfilled into VendorPaymentPart.
 */

const ZERO = new Decimal(0);

const costPaymentWhere = (bankId?: { in: string[] } | string) => ({
  bankId: bankId ?? { not: null },
  isDeleted: false,
  NOT: { amount: 0 },
});

export interface BankBalance {
  debitUsd: Decimal;
  creditUsd: Decimal;
  balanceUsd: Decimal;
}

/** All-time Debit, Credit and Balance per bank (banks with none are absent). */
export async function getBankBalances(
  bankIds?: string[],
): Promise<Map<string, BankBalance>> {
  const filter = bankIds ? { in: bankIds } : undefined;
  const [
    customerIn,
    customerOut,
    parts,
    consolidated,
    returns,
    transfersOut,
    transfersIn,
    expensePayments,
  ] = await Promise.all([
    // Customer payments are positive; a negative one would be money out.
    prisma.costPayment.groupBy({
      by: ["bankId"],
      where: { ...costPaymentWhere(filter), amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.costPayment.groupBy({
      by: ["bankId"],
      where: { ...costPaymentWhere(filter), amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    prisma.vendorPaymentPart.groupBy({
      by: ["bankId"],
      where: filter ? { bankId: filter } : undefined,
      _sum: { amountUsd: true },
    }),
    prisma.vendorConsolidatedPayment.groupBy({
      by: ["bankId"],
      where: filter ? { bankId: filter } : undefined,
      _sum: { amountUsd: true },
    }),
    prisma.vendorDepositMovement.groupBy({
      by: ["bankId"],
      where: {
        type: "RETURN",
        bankId: filter ?? { not: null },
      },
      _sum: { amountUsd: true },
    }),
    // Sending bank: the transfer plus its fee.
    prisma.accountingBankTransfer.groupBy({
      by: ["fromBankId"],
      where: filter ? { fromBankId: filter } : undefined,
      _sum: { amountUsd: true, fromFeeUsd: true },
    }),
    // Receiving bank: the transfer in, its own fee out.
    prisma.accountingBankTransfer.groupBy({
      by: ["toBankId"],
      where: filter ? { toBankId: filter } : undefined,
      _sum: { amountUsd: true, toFeeUsd: true },
    }),
    // Expense payments: the amount and its fee, both out.
    prisma.accountingExpensePayment.groupBy({
      by: ["bankId"],
      where: filter ? { bankId: filter } : undefined,
      _sum: { amountUsd: true, feeUsd: true },
    }),
  ]);

  const map = new Map<string, BankBalance>();
  const add = (bankId: string | null, amount: Decimal, side: "D" | "C") => {
    if (!bankId) return;
    const b = map.get(bankId) ?? {
      debitUsd: ZERO,
      creditUsd: ZERO,
      balanceUsd: ZERO,
    };
    if (side === "D") b.debitUsd = b.debitUsd.plus(amount);
    else b.creditUsd = b.creditUsd.plus(amount);
    b.balanceUsd = b.debitUsd.minus(b.creditUsd);
    map.set(bankId, b);
  };
  for (const r of customerIn) add(r.bankId, floatUsd(r._sum.amount ?? 0), "D");
  for (const r of customerOut) {
    add(r.bankId, floatUsd(-(r._sum.amount ?? 0)), "C");
  }
  for (const r of returns) add(r.bankId, r._sum.amountUsd ?? ZERO, "D");
  for (const r of parts) add(r.bankId, r._sum.amountUsd ?? ZERO, "C");
  for (const r of consolidated) add(r.bankId, r._sum.amountUsd ?? ZERO, "C");
  for (const r of transfersOut) {
    add(r.fromBankId, r._sum.amountUsd ?? ZERO, "C");
    add(r.fromBankId, r._sum.fromFeeUsd ?? ZERO, "C");
  }
  for (const r of transfersIn) {
    add(r.toBankId, r._sum.amountUsd ?? ZERO, "D");
    add(r.toBankId, r._sum.toFeeUsd ?? ZERO, "C");
  }
  for (const r of expensePayments) {
    add(r.bankId, r._sum.amountUsd ?? ZERO, "C");
    add(r.bankId, r._sum.feeUsd ?? ZERO, "C");
  }
  return map;
}

const customerName = (u: { name: string | null; email: string } | null) =>
  u?.name?.trim() || u?.email || "—";

/** Sum of the security deposit applied to each vendor invoice. */
async function depositAdjustments(
  vendorInvoiceIds: string[],
  hardwarePurchaseIds: string[],
) {
  const byInvoice = new Map<string, Decimal>();
  if (vendorInvoiceIds.length === 0 && hardwarePurchaseIds.length === 0) {
    return byInvoice;
  }
  const rows = await prisma.vendorDepositMovement.findMany({
    where: {
      type: "ADJUSTMENT",
      OR: [
        { vendorInvoiceId: { in: vendorInvoiceIds } },
        { hardwarePurchaseId: { in: hardwarePurchaseIds } },
      ],
    },
    select: {
      vendorInvoiceId: true,
      hardwarePurchaseId: true,
      amountUsd: true,
    },
  });
  for (const r of rows) {
    const id = r.vendorInvoiceId ?? r.hardwarePurchaseId;
    if (!id) continue;
    byInvoice.set(id, (byInvoice.get(id) ?? ZERO).plus(r.amountUsd));
  }
  return byInvoice;
}

const adjustedNote = (amount: Decimal | undefined) =>
  amount && amount.greaterThan(0) ? `deposit applied ${usd(amount)}` : "";

const depositNote = (deposit: Decimal | null | undefined) =>
  deposit && deposit.greaterThan(0)
    ? `incl. ${usd(deposit)} security deposit`
    : "";

const feeNote = (fee: Decimal, rate: Decimal) => {
  const f = feeUsd(fee, rate);
  return f.greaterThan(0) ? `incl. ${usd(f)} fee` : "";
};

async function customerRows(bankIds: string[], tz: string) {
  const payments = await prisma.costPayment.findMany({
    where: costPaymentWhere({ in: bankIds }),
    select: {
      id: true,
      bankId: true,
      amount: true,
      type: true,
      paymentDate: true,
      createdAt: true,
      narration: true,
      originalAmount: true,
      exchangeRate: true,
      invoiceId: true,
      currency: { select: { code: true } },
      user: { select: { name: true, email: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          invoiceType: true,
          totalAmount: true,
        },
      },
    },
  });

  // Every payment of these invoices, on any bank, for the split note.
  const invoiceIds = [
    ...new Set(
      payments.map((p) => p.invoiceId).filter((x): x is string => !!x),
    ),
  ];
  const siblings = invoiceIds.length
    ? await prisma.costPayment.findMany({
        where: {
          invoiceId: { in: invoiceIds },
          isDeleted: false,
          NOT: { amount: 0 },
        },
        select: {
          id: true,
          invoiceId: true,
          amount: true,
          paymentDate: true,
          createdAt: true,
          memoId: true,
          bank: { select: { name: true } },
        },
      })
    : [];
  const byInvoice = new Map<string, SiblingPayment[]>();
  for (const s of siblings) {
    if (!s.invoiceId) continue;
    const list = byInvoice.get(s.invoiceId) ?? [];
    list.push({
      id: s.id,
      amountUsd: floatUsd(s.amount),
      via: s.bank?.name ?? (s.memoId ? "memo" : "no bank recorded"),
      date: s.paymentDate ?? s.createdAt,
    });
    byInvoice.set(s.invoiceId, list);
  }

  return payments.map((p): StatementRow => {
    const amountUsd = floatUsd(p.amount);
    const inv = p.invoice;
    const split = inv
      ? splitNote({
          thisId: p.id,
          thisAmountUsd: amountUsd,
          invoiceTotalUsd: inv.totalAmount,
          payments: byInvoice.get(inv.id) ?? [],
          withOutstanding: true,
          tz,
        })
      : "";
    return {
      id: `cp_${p.id}`,
      source: "COST_PAYMENT",
      bankId: p.bankId ?? "",
      date: p.paymentDate ?? p.createdAt,
      recordedAt: p.createdAt,
      invoices: inv
        ? [
            {
              number: inv.invoiceNumber,
              href: customerInvoiceHref(inv.invoiceType, inv.id),
            },
          ]
        : [],
      invoiceType: customerPaymentTypeLabel(p.type, inv?.invoiceType),
      counterparty: { name: customerName(p.user), href: null },
      invoiceAmountUsd: inv?.totalAmount ?? null,
      side: amountUsd.isNegative() ? "CREDIT" : "DEBIT",
      amountUsd: amountUsd.abs(),
      original: formatOriginal(
        p.originalAmount,
        p.currency?.code,
        p.exchangeRate,
      ),
      // Another payment exists and this row is less than the invoice.
      partial: split !== "" && !!inv && isPartial(amountUsd, inv.totalAmount),
      note: joinNote(p.narration, split),
      receiptHref: null,
    };
  });
}

async function vendorPartRows(bankIds: string[], tz: string) {
  const invoiceSelect = {
    id: true,
    invoiceNumber: true,
    totalAmount: true,
    paidDate: true,
    vendor: { select: { name: true } },
  } as const;
  const parts = await prisma.vendorPaymentPart.findMany({
    where: { bankId: { in: bankIds } },
    select: {
      id: true,
      bankId: true,
      vendorInvoiceId: true,
      hardwarePurchaseId: true,
      amount: true,
      exchangeRate: true,
      amountUsd: true,
      transactionFee: true,
      createdAt: true,
      currency: { select: { code: true } },
      vendorInvoice: { select: invoiceSelect },
      hardwarePurchase: {
        select: { ...invoiceSelect, securityDeposit: true },
      },
    },
  });

  const vendorInvoiceIds = [
    ...new Set(
      parts.map((p) => p.vendorInvoiceId).filter((x): x is string => !!x),
    ),
  ];
  const hardwarePurchaseIds = [
    ...new Set(
      parts.map((p) => p.hardwarePurchaseId).filter((x): x is string => !!x),
    ),
  ];
  const [siblings, adjusted] = await Promise.all([
    parts.length
      ? prisma.vendorPaymentPart.findMany({
          where: {
            OR: [
              { vendorInvoiceId: { in: vendorInvoiceIds } },
              { hardwarePurchaseId: { in: hardwarePurchaseIds } },
            ],
          },
          select: {
            id: true,
            vendorInvoiceId: true,
            hardwarePurchaseId: true,
            amountUsd: true,
            createdAt: true,
            bank: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    depositAdjustments(vendorInvoiceIds, hardwarePurchaseIds),
  ]);
  const byInvoice = new Map<string, SiblingPayment[]>();
  for (const s of siblings) {
    const id = s.vendorInvoiceId ?? s.hardwarePurchaseId;
    if (!id) continue;
    const list = byInvoice.get(id) ?? [];
    // Parts of one payment share the invoice's paid date.
    list.push({
      id: s.id,
      amountUsd: s.amountUsd,
      via: s.bank.name,
      date: s.createdAt,
    });
    byInvoice.set(id, list);
  }

  const rows: StatementRow[] = [];
  for (const p of parts) {
    const kind: VendorKind = p.hardwarePurchase ? "hardware" : "farm";
    const inv = p.hardwarePurchase ?? p.vendorInvoice;
    if (!inv) continue;
    const paidDate = inv.paidDate ?? p.createdAt;
    const payments = (byInvoice.get(inv.id) ?? []).map((s) => ({
      ...s,
      date: paidDate,
    }));
    const split = splitNote({
      thisId: p.id,
      thisAmountUsd: p.amountUsd,
      invoiceTotalUsd: inv.totalAmount,
      payments,
      withOutstanding: false,
      tz,
    });
    rows.push({
      id: `vp_${p.id}`,
      source: "VENDOR_PART",
      bankId: p.bankId,
      date: paidDate,
      recordedAt: p.createdAt,
      invoices: [
        { number: inv.invoiceNumber, href: vendorInvoiceHref(kind, inv.id) },
      ],
      invoiceType: vendorKindLabel(kind),
      counterparty: { name: inv.vendor?.name ?? "—", href: null },
      invoiceAmountUsd: inv.totalAmount,
      side: "CREDIT",
      amountUsd: p.amountUsd,
      original: formatOriginal(p.amount, p.currency.code, p.exchangeRate),
      partial: split !== "",
      note: joinNote(
        split,
        feeNote(p.transactionFee, p.exchangeRate),
        depositNote(p.hardwarePurchase?.securityDeposit),
        adjustedNote(adjusted.get(inv.id)),
      ),
      receiptHref: vendorReceiptHref(kind, inv.id),
    });
  }
  return rows;
}

async function consolidatedRows(bankIds: string[]) {
  const invoiceSelect = { id: true, invoiceNumber: true, totalAmount: true };
  const payments = await prisma.vendorConsolidatedPayment.findMany({
    where: { bankId: { in: bankIds } },
    select: {
      id: true,
      bankId: true,
      kind: true,
      paidDate: true,
      amount: true,
      exchangeRate: true,
      amountUsd: true,
      transactionFee: true,
      createdAt: true,
      currency: { select: { code: true } },
      vendor: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          vendorInvoice: { select: invoiceSelect },
          hardwarePurchase: {
            select: { ...invoiceSelect, securityDeposit: true },
          },
        },
      },
    },
  });

  const vendorInvoiceIds: string[] = [];
  const hardwarePurchaseIds: string[] = [];
  for (const p of payments) {
    for (const i of p.items) {
      if (i.vendorInvoice) vendorInvoiceIds.push(i.vendorInvoice.id);
      if (i.hardwarePurchase) hardwarePurchaseIds.push(i.hardwarePurchase.id);
    }
  }
  const adjusted = await depositAdjustments(
    vendorInvoiceIds,
    hardwarePurchaseIds,
  );

  return payments.map((p): StatementRow => {
    const kind: VendorKind = p.kind === "hardware" ? "hardware" : "farm";
    const invoices = p.items
      .map((i) => i.hardwarePurchase ?? i.vendorInvoice)
      .filter((i): i is NonNullable<typeof i> => !!i);
    const deposits = p.items.reduce(
      (s, i) => s.plus(i.hardwarePurchase?.securityDeposit ?? 0),
      ZERO,
    );
    const applied = invoices.reduce(
      (s, i) => s.plus(adjusted.get(i.id) ?? 0),
      ZERO,
    );
    return {
      id: `cvp_${p.id}`,
      source: "CONSOLIDATED",
      bankId: p.bankId,
      date: p.paidDate,
      recordedAt: p.createdAt,
      invoices: invoices.map((i) => ({
        number: i.invoiceNumber,
        href: vendorInvoiceHref(kind, i.id),
      })),
      invoiceType: vendorKindLabel(kind),
      counterparty: { name: p.vendor.name, href: null },
      invoiceAmountUsd: invoices.reduce((s, i) => s.plus(i.totalAmount), ZERO),
      side: "CREDIT",
      amountUsd: p.amountUsd,
      original: formatOriginal(p.amount, p.currency.code, p.exchangeRate),
      partial: false,
      note: joinNote(
        invoices
          .map((i) => `${i.invoiceNumber} ${usd(i.totalAmount)}`)
          .join(" · "),
        feeNote(p.transactionFee, p.exchangeRate),
        depositNote(deposits),
        adjustedNote(applied),
      ),
      // The same receipt is set on every invoice the payment paid.
      receiptHref: invoices[0] ? vendorReceiptHref(kind, invoices[0].id) : null,
    };
  });
}

async function depositReturnRows(bankIds: string[]) {
  const returns = await prisma.vendorDepositMovement.findMany({
    where: { bankId: { in: bankIds }, type: "RETURN" },
    select: {
      id: true,
      bankId: true,
      date: true,
      amountUsd: true,
      amount: true,
      exchangeRate: true,
      note: true,
      receiptKey: true,
      createdAt: true,
      vendorId: true,
      vendor: { select: { name: true } },
      currency: { select: { code: true } },
    },
  });
  return returns.map((r): StatementRow => ({
    id: `dr_${r.id}`,
    source: "DEPOSIT_RETURN",
    bankId: r.bankId ?? "",
    date: r.date,
    recordedAt: r.createdAt,
    invoices: [],
    invoiceType: "Security Deposit Return",
    counterparty: {
      name: r.vendor.name,
      href: `/accounting/security-deposits?vendor=${encodeURIComponent(r.vendorId)}`,
    },
    invoiceAmountUsd: null,
    side: "DEBIT",
    amountUsd: r.amountUsd,
    original: formatOriginal(r.amount, r.currency?.code, r.exchangeRate),
    partial: false,
    note: joinNote(r.note),
    receiptHref: r.receiptKey
      ? `/api/accounting/deposit-movements/${r.id}/receipt`
      : null,
  }));
}

const transferBankSelect = {
  name: true,
  entity: { select: { name: true } },
} as const;

/** Internal transfers touching these banks: 1–4 rows each (bankTransfer.ts). */
async function transferRows(bankIds: string[]) {
  const transfers = await prisma.accountingBankTransfer.findMany({
    where: {
      OR: [{ fromBankId: { in: bankIds } }, { toBankId: { in: bankIds } }],
    },
    include: {
      fromBank: { select: transferBankSelect },
      toBank: { select: transferBankSelect },
      fromCurrency: { select: { code: true } },
      toCurrency: { select: { code: true } },
    },
  });
  const wanted = new Set(bankIds);
  return transfers.flatMap((t) =>
    transferStatementRows(
      {
        ...t,
        fromBankName: t.fromBank.name,
        toBankName: t.toBank.name,
        fromEntityName: t.fromBank.entity.name,
        toEntityName: t.toBank.entity.name,
        fromCode: t.fromCurrency.code,
        toCode: t.toCurrency.code,
        hasReceipt: !!t.receiptKey,
      },
      wanted,
    ),
  );
}

/** Expense payments from these banks: 1–2 rows each (expense.ts). */
async function expenseRows(bankIds: string[], tz: string) {
  const payments = await prisma.accountingExpensePayment.findMany({
    where: { bankId: { in: bankIds } },
    include: {
      currency: { select: { code: true } },
      expense: {
        select: {
          id: true,
          entryNumber: true,
          narration: true,
          amountDueUsd: true,
          head: { select: { name: true } },
          // Every payment of the expense, for the split note.
          payments: {
            select: {
              id: true,
              amountUsd: true,
              date: true,
              bank: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return payments.flatMap((p) =>
    expenseStatementRows(
      {
        ...p,
        code: p.currency.code,
        hasReceipt: !!p.receiptKey,
        expense: {
          id: p.expense.id,
          entryNumber: p.expense.entryNumber,
          headName: p.expense.head.name,
          narration: p.expense.narration,
          amountDueUsd: p.expense.amountDueUsd,
        },
        siblings: p.expense.payments.map((s) => ({
          id: s.id,
          amountUsd: s.amountUsd,
          via: s.bank.name,
          date: s.date,
        })),
      },
      tz,
    ),
  );
}

export interface StatementRange {
  /** Instants: the route turns the viewer's calendar days into them. */
  from?: Date | null;
  toExclusive?: Date | null;
  /** Formats the dates inside notes. */
  tz: string;
}

/** Every row of these banks, unsorted (buildStatement sorts). */
async function bankRows(bankIds: string[], tz: string) {
  if (bankIds.length === 0) return [];
  const groups = await Promise.all([
    customerRows(bankIds, tz),
    vendorPartRows(bankIds, tz),
    consolidatedRows(bankIds),
    depositReturnRows(bankIds),
    transferRows(bankIds),
    expenseRows(bankIds, tz),
  ]);
  return groups.flat();
}

/** One bank's statement. */
export async function getBankStatement(
  bankId: string,
  { from, toExclusive, tz }: StatementRange,
): Promise<Statement> {
  return buildStatement(await bankRows([bankId], tz), { from, toExclusive });
}

/**
 * Consolidated statement of several banks: one running balance across all of
 * them. A transfer between two selected banks shows both sides, which cancel
 * out except for the fees.
 */
export async function getBanksStatement(
  bankIds: string[],
  { from, toExclusive, tz }: StatementRange,
): Promise<Statement> {
  return buildStatement(await bankRows(bankIds, tz), { from, toExclusive });
}

export interface UnbankedPayments {
  count: number;
  /** USD received. */
  amountUsd: Decimal;
}

/**
 * Money received with no bank recorded in the range, so on no bank
 * statement: customer payments of the kinds that can save a bank (Hosting &
 * Colocation, Hardware Sales, Hardware Repair, balance top-ups; most predate
 * the bank field) and deposit returns. Not memo applications, and not the
 * ELECTRICITY_CHARGES / ADJUSTMENT rows, which are internal ledger entries,
 * not money moving. Vendor payments always save a bank.
 */
export async function getUnbankedPayments({
  from,
  toExclusive,
}: Omit<StatementRange, "tz">): Promise<UnbankedPayments> {
  const range =
    from || toExclusive
      ? {
          ...(from ? { gte: from } : {}),
          ...(toExclusive ? { lt: toExclusive } : {}),
        }
      : undefined;
  const [customer, returns] = await Promise.all([
    prisma.costPayment.aggregate({
      where: {
        bankId: null,
        memoId: null,
        isDeleted: false,
        type: { in: ["PAYMENT", "HARDWARE_SALES", "HARDWARE_REPAIR"] },
        amount: { gt: 0 },
        // Same date as the statement: paymentDate, else when recorded.
        ...(range
          ? {
              OR: [
                { paymentDate: range },
                { paymentDate: null, createdAt: range },
              ],
            }
          : {}),
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.vendorDepositMovement.aggregate({
      where: {
        bankId: null,
        type: "RETURN",
        ...(range ? { date: range } : {}),
      },
      _count: { _all: true },
      _sum: { amountUsd: true },
    }),
  ]);
  return {
    count: customer._count._all + returns._count._all,
    amountUsd: floatUsd(customer._sum.amount ?? 0).plus(
      returns._sum.amountUsd ?? ZERO,
    ),
  };
}
