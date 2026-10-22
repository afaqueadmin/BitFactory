import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { Decimal } from "@prisma/client/runtime/library";
import {
  checkAdjustment,
  checkInvoiceChangeWithAdjustments,
  checkReturn,
  computeDepositBalance,
} from "../vendorDeposit";

const d = (v: string | number) => new Decimal(v);

describe("computeDepositBalance", () => {
  it("held is paid minus returned and adjusted; outstanding adds pending", () => {
    const b = computeDepositBalance({
      pending: d(300),
      paid: d(1000),
      returned: d(200),
      adjusted: d(150),
    });
    expect(b.held.toString()).toBe("650");
    expect(b.outstanding.toString()).toBe("950");
  });
});

describe("checkReturn", () => {
  it("allows up to the held amount", () => {
    expect(checkReturn(d("650"), d("650"))).toBeNull();
  });
  it("rejects more than the vendor holds", () => {
    expect(checkReturn(d("650.01"), d("650"))).toMatch(/holds only \$650\.00/);
  });
  it("rejects zero", () => {
    expect(checkReturn(d(0), d(10))).toMatch(/greater than 0/);
  });
});

describe("checkAdjustment", () => {
  const invoice = {
    paymentStatus: "Pending",
    vendorId: "v1",
    totalAmount: d("10290"),
  };
  const base = {
    amountUsd: d("2000"),
    held: d("5000"),
    invoice,
    depositVendorId: "v1",
    alreadyAdjusted: d(0),
  };

  it("accepts an amount within the held deposit and the amount due", () => {
    expect(checkAdjustment(base)).toBeNull();
  });
  it("only applies to Pending invoices", () => {
    expect(
      checkAdjustment({
        ...base,
        invoice: { ...invoice, paymentStatus: "Paid" },
      }),
    ).toMatch(/Pending/);
  });
  it("requires the same vendor", () => {
    expect(
      checkAdjustment({ ...base, invoice: { ...invoice, vendorId: "v2" } }),
    ).toMatch(/different vendor/);
    expect(
      checkAdjustment({ ...base, invoice: { ...invoice, vendorId: null } }),
    ).toMatch(/different vendor/);
  });
  it("can't exceed what is still due on the invoice", () => {
    expect(
      checkAdjustment({
        ...base,
        held: d("20000"),
        amountUsd: d("9000"),
        alreadyAdjusted: d("2000"),
      }),
    ).toMatch(/Only \$8290\.00/);
  });
  it("can't exceed the held deposit", () => {
    expect(checkAdjustment({ ...base, amountUsd: d("5000.01") })).toMatch(
      /holds only/,
    );
  });
  it("rejects more than 2 decimal places", () => {
    expect(checkAdjustment({ ...base, amountUsd: d("1.005") })).toMatch(
      /2 decimal places/,
    );
  });
});

describe("checkInvoiceChangeWithAdjustments", () => {
  it("allows anything when no deposit is applied", () => {
    expect(
      checkInvoiceChangeWithAdjustments(d(0), {
        cancel: true,
        remove: true,
        vendorChanged: true,
      }),
    ).toBeNull();
  });
  it("blocks cancel, delete and vendor change once deposit is applied", () => {
    expect(checkInvoiceChangeWithAdjustments(d(100), { cancel: true })).toMatch(
      /before cancelling/,
    );
    expect(checkInvoiceChangeWithAdjustments(d(100), { remove: true })).toMatch(
      /Delete those adjustments first/,
    );
    expect(
      checkInvoiceChangeWithAdjustments(d(100), { vendorChanged: true }),
    ).toMatch(/vendor can't change/);
  });
  it("blocks a total below the applied deposit", () => {
    expect(
      checkInvoiceChangeWithAdjustments(d(100), { newTotal: 99.99 }),
    ).toMatch(/less than the \$100\.00/);
    expect(
      checkInvoiceChangeWithAdjustments(d(100), { newTotal: 100 }),
    ).toBeNull();
  });
});
