import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { accountingBank: { findUnique: vi.fn() } },
}));

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  feesUsdUnrounded,
  matchesInvoiceTotal,
  MAX_PAYMENT_PARTS,
  parseDecimal,
  parsePaymentParts,
  toUsd,
  validatePaymentAccount,
} from "../paymentAccount";

const d = (v: string) => new Decimal(v);

describe("parseDecimal", () => {
  it("accepts numbers and numeric strings", () => {
    expect(parseDecimal(360)?.toString()).toBe("360");
    expect(parseDecimal(" 3.6725 ")?.toString()).toBe("3.6725");
  });

  it("rejects zero unless allowed, negatives and junk", () => {
    expect(parseDecimal(0)).toBeNull();
    expect(parseDecimal("0", { allowZero: true })?.toString()).toBe("0");
    expect(parseDecimal(-1)).toBeNull();
    expect(parseDecimal("1e3")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("toUsd", () => {
  it("divides by the rate (1 USD = X currency) and rounds to cents", () => {
    expect(toUsd(d("360"), d("3.6")).toString()).toBe("100");
    expect(toUsd(d("350"), d("3.6")).toString()).toBe("97.22");
    expect(toUsd(d("28000"), d("280")).toString()).toBe("100");
  });
});

describe("matchesInvoiceTotal (D8)", () => {
  it("passes the plan's example: 360 AED at 3.6 on a 100 USD invoice", () => {
    expect(
      matchesInvoiceTotal([{ amount: d("360"), rate: d("3.6") }], d("100")),
    ).toBe(true);
  });

  it("blocks 350 AED at 3.6 on a 100 USD invoice", () => {
    expect(
      matchesInvoiceTotal([{ amount: d("350"), rate: d("3.6") }], d("100")),
    ).toBe(false);
  });

  it("allows up to $0.01 either way", () => {
    expect(
      matchesInvoiceTotal([{ amount: d("100.01"), rate: d("1") }], d("100")),
    ).toBe(true);
    expect(
      matchesInvoiceTotal([{ amount: d("99.99"), rate: d("1") }], d("100")),
    ).toBe(true);
    expect(
      matchesInvoiceTotal([{ amount: d("100.02"), rate: d("1") }], d("100")),
    ).toBe(false);
  });
});

describe("matchesInvoiceTotal with several currency parts", () => {
  it("passes 5 USD + 10 AED at 2 on a 10 USD invoice", () => {
    expect(
      matchesInvoiceTotal(
        [
          { amount: d("5"), rate: d("1") },
          { amount: d("10"), rate: d("2") },
        ],
        d("10"),
      ),
    ).toBe(true);
  });

  it("blocks parts that are off by $0.02", () => {
    expect(
      matchesInvoiceTotal(
        [
          { amount: d("5"), rate: d("1") },
          { amount: d("9.96"), rate: d("2") },
        ],
        d("10"),
      ),
    ).toBe(false);
  });

  it("sums unrounded conversions so per-part rounding can't hide a gap", () => {
    // 1 / 3 = 0.333.. each; three parts are 1.00 USD, not 3 x 0.33.
    const third = { amount: d("1"), rate: d("3") };
    expect(matchesInvoiceTotal([third, third, third], d("1"))).toBe(true);
  });
});

describe("vendor-side payments: amount paid includes the fee", () => {
  it("1000 USD due + 25 AED fee at 3.6725 needs 3697.50 AED", () => {
    const rate = d("3.6725");
    const target = d("1000").plus(feesUsdUnrounded([{ fee: d("25"), rate }]));
    expect(matchesInvoiceTotal([{ amount: d("3697.50"), rate }], target)).toBe(
      true,
    );
    expect(matchesInvoiceTotal([{ amount: d("3672.50"), rate }], target)).toBe(
      false,
    );
  });

  it("converts each part's fee at that part's rate", () => {
    // 10 USD due: 5 USD + 1 USD fee, and 10 AED + 2 AED fee at 2 (= 1 USD).
    const fees = feesUsdUnrounded([
      { fee: d("1"), rate: d("1") },
      { fee: d("2"), rate: d("2") },
    ]);
    expect(fees.toString()).toBe("2");
    expect(
      matchesInvoiceTotal(
        [
          { amount: d("6"), rate: d("1") },
          { amount: d("12"), rate: d("2") },
        ],
        d("10").plus(fees),
      ),
    ).toBe(true);
  });

  it("a fee of 0 leaves the target at the cash due", () => {
    const target = d("100").plus(
      feesUsdUnrounded([{ fee: d("0"), rate: d("3.6") }]),
    );
    expect(
      matchesInvoiceTotal([{ amount: d("360"), rate: d("3.6") }], target),
    ).toBe(true);
  });
});

describe("validatePaymentAccount", () => {
  const findUnique = vi.mocked(prisma.accountingBank.findUnique);
  const ids = { entityId: "e1", bankId: "b1", currencyId: "c1" };
  const bank = (overrides: Record<string, unknown> = {}) => ({
    id: "b1",
    name: "Ruya",
    entityId: "e1",
    isActive: true,
    entity: { id: "e1", name: "Higgs Ltd", isActive: true },
    currencies: [{ currency: { code: "AED", isActive: true } }],
    ...overrides,
  });

  it("requires all three ids", async () => {
    expect(await validatePaymentAccount({ ...ids, bankId: "" })).toEqual({
      error: "Entity, bank and currency are required",
    });
  });

  it("returns the currency code for a valid selection", async () => {
    findUnique.mockResolvedValueOnce(bank() as never);
    expect(await validatePaymentAccount(ids)).toEqual({
      currencyCode: "AED",
      entityName: "Higgs Ltd",
      bankName: "Ruya",
    });
  });

  it("rejects a bank from another entity", async () => {
    findUnique.mockResolvedValueOnce(bank({ entityId: "e2" }) as never);
    expect(await validatePaymentAccount(ids)).toHaveProperty("error");
  });

  it("rejects a currency the bank doesn't hold", async () => {
    findUnique.mockResolvedValueOnce(bank({ currencies: [] }) as never);
    expect(await validatePaymentAccount(ids)).toHaveProperty("error");
  });

  it("rejects inactive bank, entity or currency", async () => {
    findUnique.mockResolvedValueOnce(bank({ isActive: false }) as never);
    expect(await validatePaymentAccount(ids)).toHaveProperty("error");
    findUnique.mockResolvedValueOnce(
      bank({ entity: { id: "e1", isActive: false } }) as never,
    );
    expect(await validatePaymentAccount(ids)).toHaveProperty("error");
    findUnique.mockResolvedValueOnce(
      bank({
        currencies: [{ currency: { code: "AED", isActive: false } }],
      }) as never,
    );
    expect(await validatePaymentAccount(ids)).toHaveProperty("error");
  });
});

describe("parsePaymentParts", () => {
  const findUnique = vi.mocked(prisma.accountingBank.findUnique);
  const bankFor = (code: string) => ({
    id: "b1",
    name: "Ruya",
    entityId: "e1",
    isActive: true,
    entity: { id: "e1", name: "Higgs Ltd", isActive: true },
    currencies: [{ currency: { code, isActive: true } }],
  });
  const part = (overrides: Record<string, unknown> = {}) => ({
    entityId: "e1",
    bankId: "b1",
    currencyId: "c1",
    exchangeRate: "1",
    amount: "5",
    ...overrides,
  });

  it("requires at least one part and at most MAX_PAYMENT_PARTS", async () => {
    expect(await parsePaymentParts([])).toHaveProperty("error");
    expect(await parsePaymentParts(undefined)).toHaveProperty("error");
    expect(
      await parsePaymentParts(
        Array.from({ length: MAX_PAYMENT_PARTS + 1 }, () => part()),
      ),
    ).toHaveProperty("error");
  });

  it("parses 5 USD + 10 AED at 2 into USD values", async () => {
    findUnique.mockResolvedValueOnce(bankFor("USD") as never);
    findUnique.mockResolvedValueOnce(bankFor("AED") as never);
    const result = await parsePaymentParts([
      part(),
      part({ currencyId: "c2", exchangeRate: "2", amount: "10" }),
    ]);
    if ("error" in result) throw new Error(result.error);
    expect(result.parts.map((p) => p.currencyCode)).toEqual(["USD", "AED"]);
    expect(result.parts.map((p) => p.usd.toString())).toEqual(["5", "5"]);
  });

  it("allows the same currency twice", async () => {
    findUnique.mockResolvedValue(bankFor("AED") as never);
    const result = await parsePaymentParts([
      part({ exchangeRate: "3.67", amount: "5" }),
      part({ exchangeRate: "3.7", amount: "10" }),
    ]);
    findUnique.mockReset();
    expect(result).toHaveProperty("parts");
  });

  it("names the failing part when there are several", async () => {
    findUnique.mockResolvedValueOnce(bankFor("USD") as never);
    findUnique.mockResolvedValueOnce(bankFor("USD") as never);
    expect(
      await parsePaymentParts([part(), part({ exchangeRate: "3.67" })]),
    ).toEqual({ error: "Part 2: USD payments must use an exchange rate of 1" });
  });

  it("rejects a zero amount unless allowed (Mark as Paid)", async () => {
    findUnique.mockResolvedValueOnce(bankFor("USD") as never);
    expect(await parsePaymentParts([part({ amount: "0" })])).toHaveProperty(
      "error",
    );
    findUnique.mockResolvedValueOnce(bankFor("USD") as never);
    const result = await parsePaymentParts([part({ amount: "" })], {
      allowZeroAmount: true,
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.parts[0].amount.toString()).toBe("0");
  });

  it("rejects more than 2 decimal places on the amount", async () => {
    findUnique.mockResolvedValueOnce(bankFor("USD") as never);
    expect(await parsePaymentParts([part({ amount: "1.234" })])).toHaveProperty(
      "error",
    );
  });
});
