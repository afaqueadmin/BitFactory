import { describe, expect, it } from "vitest";
import { isStaffRole, staffActorLabel } from "@/lib/auth/staffRoles";

describe("isStaffRole", () => {
  it.each(["SUPER_ADMIN", "ADMIN", "ACCOUNTING"])("is true for %s", (role) => {
    expect(isStaffRole(role)).toBe(true);
  });

  it.each([
    "CLIENT",
    "FRANCHISEE",
    "SIMULATED",
    "SOMETHING_ELSE",
    "",
    null,
    undefined,
  ])("is false for %s", (role) => {
    expect(isStaffRole(role)).toBe(false);
  });
});

describe("staffActorLabel", () => {
  it("names each staff role", () => {
    expect(staffActorLabel("SUPER_ADMIN")).toBe("super admin");
    expect(staffActorLabel("ADMIN")).toBe("admin");
    expect(staffActorLabel("ACCOUNTING")).toBe("accounting");
  });
});
