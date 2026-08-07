import { describe, it, expect } from "vitest";
import { resolvePaybackAccountType } from "@/lib/helpers/paybackAccountType";

describe("resolvePaybackAccountType", () => {
  it("classifies SELF_MINING segment accounts as SELF_MINING", () => {
    expect(resolvePaybackAccountType("SELF_MINING")).toBe("SELF_MINING");
  });

  it("classifies every other segment as CLIENT", () => {
    expect(resolvePaybackAccountType("CORPORATE")).toBe("CLIENT");
    expect(resolvePaybackAccountType("SME")).toBe("CLIENT");
    expect(resolvePaybackAccountType("FRANCHISEE")).toBe("CLIENT");
    expect(resolvePaybackAccountType("RETAIL")).toBe("CLIENT");
  });

  it("defaults to CLIENT when segment is missing", () => {
    expect(resolvePaybackAccountType(null)).toBe("CLIENT");
    expect(resolvePaybackAccountType(undefined)).toBe("CLIENT");
    expect(resolvePaybackAccountType("")).toBe("CLIENT");
  });
});
