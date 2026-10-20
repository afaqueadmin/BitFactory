import { describe, expect, it } from "vitest";
import { canManageAccount } from "@/lib/auth/accountTiers";

const ROLES = [
  "CLIENT",
  "FRANCHISEE",
  "SIMULATED",
  "ADMIN",
  "SUPER_ADMIN",
] as const;

// actor → targets it may manage (N-8)
const ALLOWED: Record<string, string[]> = {
  CLIENT: [],
  FRANCHISEE: [],
  SIMULATED: [],
  ADMIN: ["CLIENT", "FRANCHISEE", "SIMULATED"],
  SUPER_ADMIN: ["CLIENT", "FRANCHISEE", "SIMULATED", "ADMIN"],
};

describe("canManageAccount", () => {
  for (const actor of ROLES) {
    for (const target of ROLES) {
      const expected = ALLOWED[actor].includes(target);
      it(`${actor} ${expected ? "can" : "cannot"} manage ${target}`, () => {
        expect(canManageAccount(actor, target)).toBe(expected);
      });
    }
  }

  it("refuses unknown roles on either side", () => {
    expect(canManageAccount("ADMIN", "SOMETHING_ELSE")).toBe(false);
    expect(canManageAccount("SOMETHING_ELSE", "CLIENT")).toBe(false);
  });
});
