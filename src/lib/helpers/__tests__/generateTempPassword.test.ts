import { describe, expect, it } from "vitest";
import { generateTempPassword } from "@/lib/helpers/generateTempPassword";

describe("generateTempPassword", () => {
  it("returns an 8-character base64url string", () => {
    const value = generateTempPassword();
    expect(value).toHaveLength(8);
    expect(value).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });

  it("is not derived from Math.random", () => {
    const original = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return original();
    };
    try {
      generateTempPassword();
    } finally {
      Math.random = original;
    }
    expect(called).toBe(false);
  });

  it("does not repeat across many calls", () => {
    const values = new Set(Array.from({ length: 1000 }, generateTempPassword));
    expect(values.size).toBe(1000);
  });
});
