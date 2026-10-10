import { describe, expect, it } from "vitest";
import {
  consecutiveBillingMonths,
  formatBillingMonthRange,
  hostingLineItemLabel,
  parseLineItemBillingMonths,
  sortInvoiceLineItems,
} from "../hostingMonths";

describe("consecutiveBillingMonths", () => {
  it("rolls over into the next year", () => {
    expect(
      consecutiveBillingMonths(2026, 10, 3).map((d) => d.toISOString()),
    ).toEqual([
      "2026-11-01T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
    ]);
  });
});

describe("formatBillingMonthRange", () => {
  it("returns null for no months and ignores nulls", () => {
    expect(formatBillingMonthRange([])).toBeNull();
    expect(formatBillingMonthRange([null, undefined])).toBeNull();
  });

  it("shows a single month or the first-last range", () => {
    expect(formatBillingMonthRange(["2026-10-01T00:00:00.000Z"])).toBe(
      "October 2026",
    );
    expect(
      formatBillingMonthRange([
        "2026-12-01T00:00:00.000Z",
        null,
        new Date("2026-10-01T00:00:00.000Z"),
        "2026-11-01T00:00:00.000Z",
      ]),
    ).toBe("October 2026 – December 2026");
  });
});

describe("hostingLineItemLabel", () => {
  it("includes model and short month", () => {
    expect(hostingLineItemLabel("S21 XP", "2026-10-01T00:00:00.000Z")).toBe(
      "Hosting & Colocation (S21 XP) – Oct 2026",
    );
  });
});

describe("sortInvoiceLineItems", () => {
  it("puts hardware first, then hosting by hardware order and month", () => {
    const items = [
      {
        id: "hA-nov",
        lineItemType: "HOSTING_COLOCATION" as const,
        hardwareId: "A",
        billingMonth: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "hB-oct",
        lineItemType: "HOSTING_COLOCATION" as const,
        hardwareId: "B",
        billingMonth: "2026-10-01T00:00:00.000Z",
      },
      { id: "B", lineItemType: "HARDWARE" as const, hardwareId: "B" },
      {
        id: "hA-oct",
        lineItemType: "HOSTING_COLOCATION" as const,
        hardwareId: "A",
        billingMonth: "2026-10-01T00:00:00.000Z",
      },
      { id: "A", lineItemType: "HARDWARE" as const, hardwareId: "A" },
      {
        id: "hA-legacy",
        lineItemType: "HOSTING_COLOCATION" as const,
        hardwareId: "A",
        billingMonth: null,
      },
    ];
    expect(sortInvoiceLineItems(items).map((i) => i.id)).toEqual([
      "B",
      "A",
      "hB-oct",
      "hA-legacy",
      "hA-oct",
      "hA-nov",
    ]);
  });

  it("treats a missing lineItemType as HARDWARE", () => {
    const items = [
      { id: "h", lineItemType: "HOSTING_COLOCATION" as const, hardwareId: "A" },
      { id: "a", hardwareId: "A" },
    ];
    expect(sortInvoiceLineItems(items).map((i) => i.id)).toEqual(["a", "h"]);
  });
});

describe("parseLineItemBillingMonths", () => {
  it("normalizes hosting months and leaves others null", () => {
    const result = parseLineItemBillingMonths([
      { hardwareId: "A", lineItemType: "HARDWARE" },
      {
        hardwareId: "A",
        lineItemType: "HOSTING_COLOCATION",
        billingMonth: "2026-10-17T12:00:00.000Z",
      },
      { hardwareId: "A", lineItemType: "HOSTING_COLOCATION" },
    ]);
    expect(result).toEqual({
      months: [null, new Date("2026-10-01T00:00:00.000Z"), null],
    });
  });

  it("rejects a month on a hardware row", () => {
    expect(
      parseLineItemBillingMonths([
        { hardwareId: "A", billingMonth: "2026-10-01T00:00:00.000Z" },
      ]),
    ).toHaveProperty("error");
  });

  it("rejects an invalid date", () => {
    expect(
      parseLineItemBillingMonths([
        {
          hardwareId: "A",
          lineItemType: "HOSTING_COLOCATION",
          billingMonth: "nope",
        },
      ]),
    ).toHaveProperty("error");
  });

  it("rejects the same model billed twice for one month", () => {
    expect(
      parseLineItemBillingMonths([
        {
          hardwareId: "A",
          lineItemType: "HOSTING_COLOCATION",
          billingMonth: "2026-10-01T00:00:00.000Z",
        },
        {
          hardwareId: "A",
          lineItemType: "HOSTING_COLOCATION",
          billingMonth: "2026-10-20T00:00:00.000Z",
        },
      ]),
    ).toHaveProperty("error");
  });

  it("allows the same month for different models", () => {
    expect(
      parseLineItemBillingMonths([
        {
          hardwareId: "A",
          lineItemType: "HOSTING_COLOCATION",
          billingMonth: "2026-10-01T00:00:00.000Z",
        },
        {
          hardwareId: "B",
          lineItemType: "HOSTING_COLOCATION",
          billingMonth: "2026-10-01T00:00:00.000Z",
        },
      ]),
    ).toHaveProperty("months");
  });
});
