import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/jwt", () => ({ verifyJwtToken: vi.fn() }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  ALL_PERMISSIONS,
  effectivePermissions,
  PERMISSIONS,
  SA_ONLY,
} from "../permissions";
import {
  getAuthorizationContext,
  requireAnyPermission,
  requirePermission,
} from "../authorization";

const findUser = vi.mocked(prisma.user.findUnique);
const verify = vi.mocked(verifyJwtToken);

function request(token?: string) {
  return new NextRequest("http://localhost/api/x", {
    headers: token ? { cookie: `token=${token}` } : {},
  });
}

function userRow(role: string, rolePermissions: string[][] = []) {
  return {
    role,
    isDeleted: false,
    staffRoleAssignments: rolePermissions.map((ps) => ({
      role: { permissions: ps.map((permission) => ({ permission })) },
    })),
  } as never;
}

describe("catalogue", () => {
  it("matches the reviewed catalogue: 176 permissions, 14 SA-only", () => {
    expect(ALL_PERMISSIONS).toHaveLength(176);
    expect(SA_ONLY.size).toBe(14);
    for (const p of SA_ONLY) expect(PERMISSIONS).toHaveProperty(p);
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
});

describe("effectivePermissions", () => {
  it("gives SUPER_ADMIN every permission", () => {
    expect(effectivePermissions("SUPER_ADMIN").size).toBe(176);
  });

  it("gives ADMIN and ACCOUNTING everything except SA-only (today's access)", () => {
    for (const role of ["ADMIN", "ACCOUNTING"]) {
      const perms = effectivePermissions(role);
      expect(perms.size).toBe(176 - 14);
      for (const p of SA_ONLY) expect(perms.has(p)).toBe(false);
    }
  });

  it("gives STAFF only what its custom roles grant, as a union", () => {
    expect(effectivePermissions("STAFF").size).toBe(0);
    const perms = effectivePermissions("STAFF", [
      "invoicing.view",
      "banks.view",
      "invoicing.view",
    ]);
    expect([...perms].sort()).toEqual(["banks.view", "invoicing.view"]);
  });

  it("ignores unknown and SA-only names from custom roles", () => {
    const perms = effectivePermissions("STAFF", [
      "nope.view",
      "invoicing.mark_unpaid",
      "roles.assign",
      "miners.view",
    ]);
    expect([...perms]).toEqual(["miners.view"]);
  });

  it("gives client-side roles nothing, even with custom role rows", () => {
    for (const role of ["CLIENT", "FRANCHISEE", "GUILDMASTER", "SIMULATED"]) {
      expect(effectivePermissions(role, ["miners.view"]).size).toBe(0);
    }
  });
});

describe("getAuthorizationContext", () => {
  beforeEach(() => {
    findUser.mockReset();
    verify.mockReset();
  });

  it("401 without a token or with a bad one", async () => {
    let ctx = await getAuthorizationContext(request());
    expect("response" in ctx && ctx.response.status).toBe(401);

    verify.mockRejectedValueOnce(new Error("expired"));
    ctx = await getAuthorizationContext(request("t"));
    expect("response" in ctx && ctx.response.status).toBe(401);
  });

  it("401 for a deleted or missing user", async () => {
    verify.mockResolvedValue({ userId: "u1" } as never);
    findUser.mockResolvedValueOnce(null);
    let ctx = await getAuthorizationContext(request("t"));
    expect("response" in ctx && ctx.response.status).toBe(401);

    findUser.mockResolvedValueOnce({
      ...(userRow("ADMIN") as object),
      isDeleted: true,
    } as never);
    ctx = await getAuthorizationContext(request("t"));
    expect("response" in ctx && ctx.response.status).toBe(401);
  });

  it("denies when loading fails", async () => {
    verify.mockResolvedValue({ userId: "u1" } as never);
    findUser.mockRejectedValueOnce(new Error("db down"));
    const ctx = await getAuthorizationContext(request("t"));
    expect("response" in ctx && ctx.response.status).toBe(500);
  });

  it("loads system and custom role permissions together", async () => {
    verify.mockResolvedValue({ userId: "u1" } as never);
    findUser.mockResolvedValueOnce(
      userRow("STAFF", [["invoicing.view"], ["banks.view", "banks.edit"]]),
    );
    const ctx = await getAuthorizationContext(request("t"));
    if ("response" in ctx) throw new Error("expected a context");
    expect(ctx.userId).toBe("u1");
    expect(requirePermission(ctx, "banks.edit")).toBeNull();
    expect(requirePermission(ctx, "banks.delete")?.status).toBe(403);
    expect(
      requireAnyPermission(ctx, ["miners.view", "invoicing.view"]),
    ).toBeNull();
    expect(requireAnyPermission(ctx, ["miners.view"])?.status).toBe(403);
  });
});
