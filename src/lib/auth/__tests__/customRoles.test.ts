import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { parseRoleBody } from "@/lib/auth/customRoles";
import { canManageAccount } from "@/lib/auth/accountTiers";
import { isStaffRole } from "@/lib/auth/staffRoles";
import {
  ALL_PERMISSIONS,
  SA_ONLY,
  effectivePermissions,
} from "@/lib/auth/permissions";

describe("parseRoleBody", () => {
  it("accepts grantable permissions, trimmed and de-duplicated", () => {
    const r = parseRoleBody({
      name: "  Finance ",
      description: " ",
      permissions: ["invoicing.view", "invoicing.view", "expenses.view"],
    });
    expect(r).toEqual({
      name: "Finance",
      description: null,
      permissions: ["invoicing.view", "expenses.view"],
    });
  });

  it("refuses SUPER_ADMIN-only permissions", () => {
    const r = parseRoleBody({
      name: "Back door",
      permissions: ["invoicing.view", "invoicing.mark_unpaid"],
    });
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(400);
  });

  it("refuses unknown permissions, a missing name and a non-list", () => {
    for (const body of [
      { name: "X", permissions: ["nope.view"] },
      { name: "", permissions: [] },
      { name: "X", permissions: "invoicing.view" },
      { name: "X".repeat(61), permissions: [] },
      null,
    ])
      expect(parseRoleBody(body)).toBeInstanceOf(NextResponse);
  });
});

describe("STAFF system role", () => {
  it("with every grantable permission equals ADMIN (the Admin/Accounting move)", () => {
    const grantable = ALL_PERMISSIONS.filter((p) => !SA_ONLY.has(p));
    expect(grantable).toHaveLength(194);
    expect([...effectivePermissions("STAFF", grantable)].sort()).toEqual(
      [...effectivePermissions("ADMIN", [])].sort(),
    );
  });

  it("is a staff role", () => {
    expect(isStaffRole("STAFF")).toBe(true);
  });

  it("manages the same accounts as ADMIN", () => {
    for (const target of [
      "CLIENT",
      "FRANCHISEE",
      "SIMULATED",
      "GUILDMASTER",
      "GUILDMEMBER",
      "ADMIN",
      "ACCOUNTING",
      "STAFF",
      "SUPER_ADMIN",
    ])
      expect(canManageAccount("STAFF", target), target).toBe(
        canManageAccount("ADMIN", target),
      );
  });

  it("can be managed by a SUPER_ADMIN only", () => {
    expect(canManageAccount("SUPER_ADMIN", "STAFF")).toBe(true);
    expect(canManageAccount("ADMIN", "STAFF")).toBe(false);
  });
});
