import { describe, expect, it } from "vitest";
import { validateStandardLineItems } from "../invoiceLineItems";

const hardware = (key: string, quantity = 2, unitPrice = 100) => ({
  key,
  hardwareId: `hw-${key}`,
  model: `Model ${key}`,
  quantity,
  unitPrice,
  lineItemType: "HARDWARE" as const,
});

const discount = (
  parentKey: string,
  unitPrice: number,
  model = "Discount",
) => ({
  key: `d-${parentKey}-${unitPrice}`,
  parentKey,
  hardwareId: "",
  model,
  quantity: 1,
  unitPrice,
  lineItemType: "DISCOUNT" as const,
});

describe("validateStandardLineItems", () => {
  it("takes discounts off the total, stored negative and linked", () => {
    const result = validateStandardLineItems([
      hardware("a"),
      hardware("b", 1, 50),
      discount("a", 25.5, "  Commission  "),
    ]);
    if ("error" in result) throw new Error(result.error);

    expect(result.totalAmount).toBe(224.5);
    expect(result.totalMiners).toBe(3);
    // Average hardware rate stays gross.
    expect(result.unitPrice).toBe(83.33);
    expect(result.discountRows).toHaveLength(1);
    const [row] = result.discountRows;
    expect(row.model).toBe("Commission");
    expect(row.totalPrice).toBe(-25.5);
    expect(row.unitPrice).toBe(-25.5);
    expect(row.parentLineItemId).toBe(result.parentRows[0].id);
  });

  it("works without discounts or keys (bulk create)", () => {
    const result = validateStandardLineItems([
      { ...hardware("a"), key: undefined },
    ]);
    expect(result).toMatchObject({ totalAmount: 200, discountRows: [] });
  });

  it("allows a discount equal to its row", () => {
    expect(
      validateStandardLineItems([hardware("a"), discount("a", 200)]),
    ).toMatchObject({ totalAmount: 0 });
  });

  it.each([
    ["more than its row", [hardware("a"), discount("a", 200.01)]],
    ["no row", [hardware("a"), discount("missing", 10)]],
    ["two on one row", [hardware("a"), discount("a", 10), discount("a", 5)]],
    ["an empty label", [hardware("a"), discount("a", 10, "   ")]],
    ["a zero amount", [hardware("a"), discount("a", 0)]],
    ["three decimals", [hardware("a"), discount("a", 1.005)]],
    ["only discounts", [discount("a", 10)]],
    ["duplicate keys", [hardware("a"), hardware("a")]],
    ["a long label", [hardware("a"), discount("a", 10, "x".repeat(101))]],
  ])("rejects %s", (_name, items) => {
    expect(validateStandardLineItems(items)).toHaveProperty("error");
  });

  it("rejects a discount whose parent is another discount", () => {
    const first = discount("a", 10);
    expect(
      validateStandardLineItems([hardware("a"), first, discount(first.key, 1)]),
    ).toHaveProperty("error");
  });
});
