import { describe, expect, it } from "vitest";
import {
  formatRepairPrice,
  parseRepairChargeInput,
  parseRepairSiteSettingInput,
} from "@/lib/repairCharges";

const base = { site: "BRAZIL", repairType: "PSU repair" };

describe("parseRepairChargeInput", () => {
  it("accepts a fixed price and clears amountMax", () => {
    expect(
      parseRepairChargeInput({
        ...base,
        priceType: "FIXED",
        amount: "120",
        amountMax: 200,
      }),
    ).toMatchObject({ amount: 120, amountMax: null, isActive: true });
  });

  it("requires a price unless EXTERNAL", () => {
    expect(parseRepairChargeInput({ ...base, priceType: "FIXED" })).toEqual({
      error: "Enter a price",
    });
    expect(
      parseRepairChargeInput({ ...base, priceType: "EXTERNAL", amount: 50 }),
    ).toMatchObject({ amount: null, amountMax: null });
  });

  it("requires a range max above the min", () => {
    expect(
      parseRepairChargeInput({
        ...base,
        priceType: "RANGE",
        amount: 180,
        amountMax: 150,
      }),
    ).toHaveProperty("error");
    expect(
      parseRepairChargeInput({
        ...base,
        priceType: "RANGE",
        amount: 150,
        amountMax: 180,
      }),
    ).toMatchObject({ amount: 150, amountMax: 180 });
  });

  it("rejects bad sites, names, amounts and links", () => {
    expect(parseRepairChargeInput({ ...base, site: "CHILE" })).toHaveProperty(
      "error",
    );
    expect(
      parseRepairChargeInput({ ...base, repairType: "  " }),
    ).toHaveProperty("error");
    expect(parseRepairChargeInput({ ...base, amount: -1 })).toHaveProperty(
      "error",
    );
    expect(
      parseRepairChargeInput({
        ...base,
        amount: 1,
        linkUrl: "javascript:alert(1)",
      }),
    ).toHaveProperty("error");
  });
});

describe("parseRepairSiteSettingInput", () => {
  it("requires a fee", () => {
    expect(parseRepairSiteSettingInput({ site: "ETHIOPIA" })).toHaveProperty(
      "error",
    );
    expect(
      parseRepairSiteSettingInput({
        site: "ETHIOPIA",
        handsAndEyesFee: 45,
        partsUrl: "",
      }),
    ).toEqual({ site: "ETHIOPIA", handsAndEyesFee: 45, partsUrl: null });
  });
});

describe("formatRepairPrice", () => {
  it("formats each price type", () => {
    expect(
      formatRepairPrice({ priceType: "FIXED", amount: 120, amountMax: null }),
    ).toBe("$120");
    expect(
      formatRepairPrice({ priceType: "RANGE", amount: 150, amountMax: 180 }),
    ).toBe("$150 – $180");
    expect(
      formatRepairPrice({
        priceType: "EXTERNAL",
        amount: null,
        amountMax: null,
      }),
    ).toBe("See website");
  });
});
