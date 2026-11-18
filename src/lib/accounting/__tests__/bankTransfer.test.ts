import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  TransferForRows,
  transferAmounts,
  transferStatementRows,
} from "../bankTransfer";
import { buildStatement } from "../bankStatementRows";

const D = (v: number | string) => new Decimal(v);

const input = (over: Partial<Parameters<typeof transferAmounts>[0]> = {}) => ({
  fromCode: "AED",
  toCode: "USD",
  fromAmount: D(200),
  fromFee: D(20),
  conversionRate: D("0.5"),
  toAmount: D(100),
  toFee: D(5),
  fromUsdRate: null,
  ...over,
});

const ok = (r: ReturnType<typeof transferAmounts>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("transferAmounts", () => {
  it("AED -> USD at the bank rate: USD value from the USD side, fee in AED", () => {
    const r = ok(transferAmounts(input()));
    expect(r.amountUsd.toFixed(2)).toBe("100.00");
    expect(r.fromFeeUsd.toFixed(2)).toBe("10.00");
    expect(r.toFeeUsd.toFixed(2)).toBe("5.00");
    expect(r.fromExchangeRate.toString()).toBe("2");
    expect(r.toExchangeRate.toString()).toBe("1");
    expect(r.conversionRate.toString()).toBe("0.5");
  });

  it("USD -> AED: USD value = amount sent", () => {
    const r = ok(
      transferAmounts(
        input({
          fromCode: "USD",
          toCode: "AED",
          fromAmount: D(100),
          fromFee: D(0),
          conversionRate: D("3.6725"),
          toAmount: D("367.25"),
          toFee: D("36.73"),
        }),
      ),
    );
    expect(r.amountUsd.toFixed(2)).toBe("100.00");
    expect(r.fromExchangeRate.toString()).toBe("1");
    expect(r.toExchangeRate.toString()).toBe("3.6725");
    expect(r.toFeeUsd.toFixed(2)).toBe("10.00");
  });

  it("neither side USD: needs the USD rate; the receiving rate follows", () => {
    const base = input({
      fromCode: "AED",
      toCode: "PKR",
      fromAmount: D(200),
      fromFee: D(0),
      conversionRate: D(75),
      toAmount: D(15000),
      toFee: D(0),
    });
    expect(transferAmounts(base)).toHaveProperty("error");
    const r = ok(transferAmounts({ ...base, fromUsdRate: D(2) }));
    expect(r.amountUsd.toFixed(2)).toBe("100.00");
    expect(r.toExchangeRate.toString()).toBe("150");
  });

  it("same currency: rate 1 and received must equal sent", () => {
    const same = input({
      fromCode: "USD",
      toCode: "USD",
      fromAmount: D(80),
      fromFee: D(20),
      conversionRate: null,
      toAmount: D(80),
      toFee: D(0),
    });
    const r = ok(transferAmounts(same));
    expect(r.conversionRate.toString()).toBe("1");
    expect(r.amountUsd.toFixed(2)).toBe("80.00");
    expect(r.fromFeeUsd.toFixed(2)).toBe("20.00");
    expect(transferAmounts({ ...same, toAmount: D(79) })).toHaveProperty(
      "error",
    );
  });

  it("rejects a received amount that isn't sent × rate", () => {
    expect(transferAmounts(input({ toAmount: D("100.05") }))).toHaveProperty(
      "error",
    );
    // Within rounding is fine.
    ok(
      transferAmounts(
        input({ conversionRate: D("0.50002"), toAmount: D(100) }),
      ),
    );
  });

  it("rejects bad amounts and fees", () => {
    expect(transferAmounts(input({ fromAmount: D(0) }))).toHaveProperty(
      "error",
    );
    expect(transferAmounts(input({ fromFee: D(-1) }))).toHaveProperty("error");
    expect(transferAmounts(input({ toFee: D("1.234") }))).toHaveProperty(
      "error",
    );
    expect(transferAmounts(input({ conversionRate: null }))).toHaveProperty(
      "error",
    );
  });
});

const transfer = (over: Partial<TransferForRows> = {}): TransferForRows => ({
  id: "t1",
  date: new Date("2026-11-10T00:00:00Z"),
  createdAt: new Date("2026-11-10T09:00:00Z"),
  fromBankId: "A",
  toBankId: "B",
  fromBankName: "Bank A",
  toBankName: "Bank B",
  fromEntityName: "Higgs Computing Inc",
  toEntityName: "Higgs Computing Inc",
  fromCode: "AED",
  toCode: "USD",
  fromAmount: D(200),
  fromFee: D(20),
  fromExchangeRate: D(2),
  toAmount: D(100),
  toFee: D(5),
  toExchangeRate: D(1),
  conversionRate: D("0.5"),
  amountUsd: D(100),
  fromFeeUsd: D(10),
  toFeeUsd: D(5),
  reference: "TT123",
  note: null,
  hasReceipt: true,
  ...over,
});

describe("transferStatementRows", () => {
  it("the user's example: A loses $110, B gains $95", () => {
    const rows = transferStatementRows(transfer(), new Set(["A", "B"]));
    expect(
      rows.map((r) => [r.id, r.bankId, r.side, r.amountUsd.toFixed(2)]),
    ).toEqual([
      ["bt_t1_a1", "A", "CREDIT", "100.00"],
      ["bt_t1_a2", "A", "CREDIT", "10.00"],
      ["bt_t1_b1", "B", "DEBIT", "100.00"],
      ["bt_t1_b2", "B", "CREDIT", "5.00"],
    ]);
    expect(rows[0].invoiceType).toBe("Internal Transfer");
    expect(rows[1].invoiceType).toBe("Transfer Fee");
    expect(rows[0].counterparty).toEqual({
      name: "To: Bank B",
      href: "/accounting/payment-accounts/banks/B",
    });
    expect(rows[2].counterparty.name).toBe("From: Bank A");
    expect(rows[0].original).toBe("200.00 AED @ 2");
    expect(rows[1].original).toBe("20.00 AED @ 2");
    expect(rows[0].note).toBe("received 100.00 USD @ 0.5 · ref TT123");
    expect(rows[2].note).toBe("sent 200.00 AED @ 0.5 · ref TT123");
    expect(rows[0].receiptHref).toBe(
      "/api/accounting/bank-transfers/t1/receipt",
    );
    expect(rows[1].receiptHref).toBeNull();

    const a = buildStatement(rows.filter((r) => r.bankId === "A"));
    const b = buildStatement(rows.filter((r) => r.bankId === "B"));
    expect(a.closingBalanceUsd.toFixed(2)).toBe("-110.00");
    expect(b.closingBalanceUsd.toFixed(2)).toBe("95.00");
    // Both banks together: only the fees remain.
    expect(buildStatement(rows).closingBalanceUsd.toFixed(2)).toBe("-15.00");
  });

  it("only the selected bank's side, no fee rows when fees are 0", () => {
    const rows = transferStatementRows(
      transfer({
        fromFee: D(0),
        fromFeeUsd: D(0),
        toFee: D(0),
        toFeeUsd: D(0),
      }),
      new Set(["B"]),
    );
    expect(rows.map((r) => r.id)).toEqual(["bt_t1_b1"]);
  });

  it("inter-company and same-bank currency labels", () => {
    const inter = transferStatementRows(
      transfer({ toEntityName: "Higgs Computing RAK UAE" }),
      new Set(["A"]),
    );
    expect(inter[0].note).toMatch(
      /^Inter-company: Higgs Computing Inc → Higgs Computing RAK UAE · /,
    );
    const sameBank = transferStatementRows(
      transfer({ toBankId: "A", toBankName: "Bank A" }),
      new Set(["A"]),
    );
    expect(sameBank.map((r) => r.counterparty.name)).toEqual([
      "To: Bank A (USD)",
      "To: Bank A (USD)",
      "From: Bank A (AED)",
      "From: Bank A (AED)",
    ]);
  });
});
