import { describe, expect, it } from "vitest";
import {
  computeRepairTotals,
  defaultRepairNote,
  parseRepairInvoiceInput,
  repairLineAmount,
} from "../hardwareRepair";

const valid = {
  minerId: "miner-1",
  lineItems: [
    { description: "Hashboard replacement", quantity: 1, unitPrice: 450 },
    { description: "Fan", quantity: 2, unitPrice: 12.5 },
  ],
  discountAmount: 25,
  repairNote: "Replaced hashboard and two fans",
};

describe("computeRepairTotals", () => {
  it("sums lines and subtracts the discount", () => {
    expect(computeRepairTotals(valid.lineItems, 25)).toEqual({
      subtotal: 475,
      discount: 25,
      total: 450,
    });
  });

  it("does not drift with float cents", () => {
    expect(
      computeRepairTotals(
        [
          { quantity: 3, unitPrice: 0.1 },
          { quantity: 1, unitPrice: 0.2 },
        ],
        0.3,
      ),
    ).toEqual({ subtotal: 0.5, discount: 0.3, total: 0.2 });
    expect(repairLineAmount(3, 19.99)).toBe(59.97);
  });
});

describe("defaultRepairNote", () => {
  it("lists descriptions with quantities", () => {
    expect(defaultRepairNote("ABC-20261011-001", valid.lineItems)).toBe(
      "Repair invoice ABC-20261011-001:\n- Hashboard replacement x1\n- Fan x2",
    );
  });

  it("works before the invoice number exists and skips blank lines", () => {
    expect(defaultRepairNote(null, [{ description: "  ", quantity: 1 }])).toBe(
      "Repair invoice",
    );
  });
});

describe("parseRepairInvoiceInput", () => {
  it("accepts a valid body and returns totals", () => {
    const result = parseRepairInvoiceInput(valid);
    expect(result).toMatchObject({
      minerId: "miner-1",
      subtotal: 475,
      discount: 25,
      total: 450,
      repairNote: "Replaced hashboard and two fans",
    });
    if ("lineItems" in result) {
      expect(result.lineItems[1]).toEqual({
        description: "Fan",
        quantity: 2,
        unitPrice: 12.5,
        totalPrice: 25,
      });
    }
  });

  it("treats a missing discount as 0", () => {
    expect(
      parseRepairInvoiceInput({ ...valid, discountAmount: undefined }),
    ).toMatchObject({ discount: 0, total: 475 });
  });

  it.each([
    ["no miner", { minerId: "" }],
    ["no line items", { lineItems: [] }],
    [
      "blank description",
      { lineItems: [{ description: " ", quantity: 1, unitPrice: 1 }] },
    ],
    [
      "fractional qty",
      { lineItems: [{ description: "x", quantity: 1.5, unitPrice: 1 }] },
    ],
    [
      "zero rate",
      { lineItems: [{ description: "x", quantity: 1, unitPrice: 0 }] },
    ],
    [
      "3-decimal rate",
      { lineItems: [{ description: "x", quantity: 1, unitPrice: 1.005 }] },
    ],
    ["negative discount", { discountAmount: -1 }],
    ["discount over subtotal", { discountAmount: 475.01 }],
    ["discount equal to subtotal", { discountAmount: 475 }],
    ["blank note", { repairNote: "   " }],
  ])("rejects %s", (_label, patch) => {
    expect(parseRepairInvoiceInput({ ...valid, ...patch })).toHaveProperty(
      "error",
    );
  });
});
