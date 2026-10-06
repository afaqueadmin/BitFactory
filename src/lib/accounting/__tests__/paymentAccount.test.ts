import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { accountingBank: { findUnique: vi.fn() } },
}));

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  matchesInvoiceTotal,
  parseDecimal,
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
    expect(matchesInvoiceTotal(d("360"), d("3.6"), d("100"))).toBe(true);
  });

  it("blocks 350 AED at 3.6 on a 100 USD invoice", () => {
    expect(matchesInvoiceTotal(d("350"), d("3.6"), d("100"))).toBe(false);
  });

  it("allows up to $0.01 either way", () => {
    expect(matchesInvoiceTotal(d("100.01"), d("1"), d("100"))).toBe(true);
    expect(matchesInvoiceTotal(d("99.99"), d("1"), d("100"))).toBe(true);
    expect(matchesInvoiceTotal(d("100.02"), d("1"), d("100"))).toBe(false);
  });
});

describe("validatePaymentAccount", () => {
  const findUnique = vi.mocked(prisma.accountingBank.findUnique);
  const ids = { entityId: "e1", bankId: "b1", currencyId: "c1" };
  const bank = (overrides: Record<string, unknown> = {}) => ({
    id: "b1",
    entityId: "e1",
    isActive: true,
    entity: { id: "e1", isActive: true },
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
    expect(await validatePaymentAccount(ids)).toEqual({ currencyCode: "AED" });
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
