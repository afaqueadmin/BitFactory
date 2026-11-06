import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

// --- mocks -----------------------------------------------------------------

const db = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  });
  const client = {
    vendorInvoice: model(),
    hardwarePurchaseInvoice: model(),
    vendorConsolidatedPayment: model(),
    vendorConsolidatedPaymentItem: model(),
    auditLog: model(),
    $transaction: vi.fn(),
  };
  return client;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const parseVendorPayment = vi.hoisted(() => vi.fn());
vi.mock("@/lib/accounting/vendorPayment", () => ({ parseVendorPayment }));

const deposit = vi.hoisted(() => ({
  adjustedOnInvoice: vi.fn(),
  lockVendor: vi.fn(),
  getVendorDepositBalance: vi.fn(),
}));
vi.mock("@/lib/accounting/vendorDeposit", () => deposit);

import {
  recordConsolidatedPayment,
  undoConsolidatedPayment,
} from "../consolidatedVendorPayment";

// --- the QRB Labs case: 1157 + 1153 - credit 1151, paid in one transfer ----

const VENDOR = "qrb";
const inv = (
  id: string,
  invoiceNumber: string,
  total: string,
  extra: Partial<{ vendorId: string | null; paymentStatus: string }> = {},
) => ({
  id,
  invoiceNumber,
  vendorId: VENDOR,
  totalAmount: new Decimal(total),
  paymentStatus: "Pending",
  billingDate: new Date("2026-11-01"),
  dueDate: new Date("2026-11-15"),
  ...extra,
});
const QRB = [
  inv("i1157", "1157", "10290.00"),
  inv("i1153", "1153", "45.00"),
  inv("i1151", "1151", "-23.05"),
];
const PAID = new Date("2026-11-05T00:00:00.000Z");
const PART = {
  entityId: "higgs",
  bankId: "wise",
  currencyId: "usd",
  amount: new Decimal("10322.72"),
  exchangeRate: new Decimal("1"),
  amountUsd: new Decimal("10322.72"),
  transactionFee: new Decimal("10.77"),
  sortOrder: 0,
};

const body = (ids = ["i1157", "i1153", "i1151"]) => ({
  vendorId: VENDOR,
  invoiceIds: ids,
  paidDate: PAID.toISOString(),
  part: {
    entityId: "higgs",
    bankId: "wise",
    currencyId: "usd",
    exchangeRate: "1",
    amount: "10322.72",
    transactionFee: "10.77",
  },
  receiptKey: "vendor-receipts/wise.pdf",
});

const json = async (res: Response) => ({
  status: res.status,
  body: await res.json(),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.vendorInvoice.findMany.mockResolvedValue(QRB);
  db.vendorInvoice.updateMany.mockResolvedValue({ count: 1 });
  db.vendorConsolidatedPayment.create.mockResolvedValue({ id: "pay1" });
  db.auditLog.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(db),
  );
  deposit.adjustedOnInvoice.mockResolvedValue(new Decimal(0));
  deposit.lockVendor.mockResolvedValue(undefined);
  parseVendorPayment.mockResolvedValue({
    data: {
      paymentStatus: "Paid",
      paidDate: PAID,
      paymentReceiptKey: "vendor-receipts/wise.pdf",
    },
    parts: [PART],
    totalUsd: PART.amountUsd,
    audit: { paidDate: PAID },
  });
});

describe("recordConsolidatedPayment", () => {
  it("pays 1157 + 1153 - credit 1151 = $10,311.95 due, plus the fee", async () => {
    const res = await json(
      await recordConsolidatedPayment("farm", "admin", body()),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.invoiceNumbers).toEqual(["1157", "1153", "1151"]);

    // The amount due checked against the transfer (D8: amount = due + fee).
    const [, dueTotal, purpose] = parseVendorPayment.mock.calls[0];
    expect(dueTotal.toString()).toBe("10311.95");
    expect(purpose).toBe("vendor-receipt");

    // Every invoice: Paid, with the entered date and the one receipt.
    expect(db.vendorInvoice.updateMany).toHaveBeenCalledTimes(3);
    for (const call of db.vendorInvoice.updateMany.mock.calls) {
      expect(call[0].where).toMatchObject({
        vendorId: VENDOR,
        paymentStatus: "Pending",
      });
      expect(call[0].data).toEqual({
        paymentStatus: "Paid",
        paidDate: PAID,
        paymentReceiptKey: "vendor-receipts/wise.pdf",
        updatedBy: "admin",
      });
    }

    // One transfer, with each invoice's share (the credit negative).
    const created = db.vendorConsolidatedPayment.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      kind: "farm",
      vendorId: VENDOR,
      paidDate: PAID,
      bankId: "wise",
      receiptKey: "vendor-receipts/wise.pdf",
    });
    expect(created.amount.toString()).toBe("10322.72");
    expect(created.transactionFee.toString()).toBe("10.77");
    expect(
      created.items.create.map(
        (i: { amountUsd: Decimal; vendorInvoiceId: string }) => [
          i.vendorInvoiceId,
          i.amountUsd.toString(),
        ],
      ),
    ).toEqual([
      ["i1157", "10290"],
      ["i1153", "45"],
      ["i1151", "-23.05"],
    ]);
    expect(deposit.lockVendor).toHaveBeenCalledWith(db, VENDOR);
    // One audit row for the transfer + one per invoice.
    expect(db.auditLog.create).toHaveBeenCalledTimes(4);
  });

  it("uses the cash due after a security deposit already applied", async () => {
    deposit.adjustedOnInvoice.mockImplementation(
      async (_db: unknown, _k: unknown, id: string) =>
        new Decimal(id === "i1157" ? "1000" : "0"),
    );
    await recordConsolidatedPayment("farm", "admin", body());
    expect(parseVendorPayment.mock.calls[0][1].toString()).toBe("9311.95");
  });

  it("needs at least two invoices", async () => {
    const res = await json(
      await recordConsolidatedPayment("farm", "admin", body(["i1157"])),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least two invoices/);
  });

  it("refuses invoices from another vendor", async () => {
    db.vendorInvoice.findMany.mockResolvedValue([
      QRB[0],
      inv("x", "900", "10", { vendorId: "other" }),
    ]);
    const res = await json(
      await recordConsolidatedPayment("farm", "admin", body(["i1157", "x"])),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/another vendor/);
  });

  it("refuses an invoice that isn't Pending", async () => {
    db.vendorInvoice.findMany.mockResolvedValue([
      QRB[0],
      inv("i1153", "1153", "45", { paymentStatus: "Paid" }),
    ]);
    const res = await json(
      await recordConsolidatedPayment(
        "farm",
        "admin",
        body(["i1157", "i1153"]),
      ),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1153 is paid/);
  });

  it("refuses a total of zero or less (a credit needs invoices it offsets)", async () => {
    db.vendorInvoice.findMany.mockResolvedValue([
      inv("a", "1", "20"),
      inv("b", "2", "-23.05"),
    ]);
    const res = await json(
      await recordConsolidatedPayment("farm", "admin", body(["a", "b"])),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/-\$3\.05/);
    expect(parseVendorPayment).not.toHaveBeenCalled();
  });

  it("passes on the payment check's message (amount doesn't match due + fee)", async () => {
    parseVendorPayment.mockResolvedValue({
      error: "The amount paid must equal the cash due plus transaction fees",
    });
    const res = await json(
      await recordConsolidatedPayment("farm", "admin", body()),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cash due plus transaction fees/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses more than one currency", async () => {
    parseVendorPayment.mockResolvedValue({
      data: { paidDate: PAID, paymentReceiptKey: "k" },
      parts: [PART, PART],
      totalUsd: PART.amountUsd,
      audit: {},
    });
    const res = await json(
      await recordConsolidatedPayment("farm", "admin", body()),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/one currency/);
  });

  it("rolls back when an invoice changed meanwhile", async () => {
    db.vendorInvoice.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const res = await json(
      await recordConsolidatedPayment("farm", "admin", body()),
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1153 was updated by someone else/);
    expect(db.vendorConsolidatedPayment.create).not.toHaveBeenCalled();
  });

  it("works for hardware purchases with their own receipt purpose", async () => {
    db.hardwarePurchaseInvoice.findMany.mockResolvedValue(QRB);
    db.hardwarePurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    await recordConsolidatedPayment("hardware", "admin", body());
    expect(parseVendorPayment.mock.calls[0][2]).toBe(
      "hardware-purchase-receipt",
    );
    expect(db.hardwarePurchaseInvoice.updateMany).toHaveBeenCalledTimes(3);
    expect(db.vendorInvoice.updateMany).not.toHaveBeenCalled();
  });
});

describe("undoConsolidatedPayment", () => {
  it("puts every invoice back to Pending and removes the payment", async () => {
    db.vendorConsolidatedPayment.findUniqueOrThrow.mockResolvedValue({
      id: "pay1",
      vendorId: VENDOR,
      paidDate: PAID,
      entityId: "higgs",
      bankId: "wise",
      currencyId: "usd",
      amount: new Decimal("10322.72"),
      exchangeRate: new Decimal("1"),
      amountUsd: new Decimal("10322.72"),
      transactionFee: new Decimal("10.77"),
      receiptKey: "vendor-receipts/wise.pdf",
      items: QRB.map((q) => ({
        amountUsd: q.totalAmount,
        vendorInvoice: { id: q.id, invoiceNumber: q.invoiceNumber },
        hardwarePurchase: null,
      })),
    });
    const tx = db as never;
    const result = await undoConsolidatedPayment(tx, "farm", "pay1", "boss");
    expect(result.invoiceNumbers).toEqual(["1157", "1153", "1151"]);
    expect(db.vendorInvoice.updateMany).toHaveBeenCalledTimes(3);
    expect(db.vendorInvoice.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "i1157", paymentStatus: "Paid" },
      data: {
        paymentStatus: "Pending",
        paidDate: null,
        paymentReceiptKey: null,
        updatedBy: "boss",
      },
    });
    expect(db.vendorConsolidatedPayment.delete).toHaveBeenCalledWith({
      where: { id: "pay1" },
    });
    expect(db.auditLog.create).toHaveBeenCalledTimes(4);
  });
});
