import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    poolAuth: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    guildMembership: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  franchiseeCustomerSubaccountNames,
  isAdminRole,
  parseRequestedSubaccounts,
  resolveAllowedSubaccounts,
  scopeRequestedSubaccounts,
} from "@/lib/luxorProxyScope";

const poolAuth = vi.mocked(prisma.poolAuth);
const users = vi.mocked(prisma.user);
const memberships = vi.mocked(prisma.guildMembership);

const authKeys = (...names: string[]) =>
  names.map((authKey) => ({ authKey })) as never;
const customers = (...lists: string[][]) =>
  lists.map((names) => ({
    poolAuths: names.map((authKey) => ({ authKey })),
  })) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isAdminRole", () => {
  it("is true only for staff roles", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("ACCOUNTING")).toBe(true);
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
    expect(isAdminRole("CLIENT")).toBe(false);
    expect(isAdminRole("FRANCHISEE")).toBe(false);
    expect(isAdminRole("SIMULATED")).toBe(false);
  });
});

describe("resolveAllowedSubaccounts", () => {
  it("leaves admins unrestricted without touching the DB", async () => {
    expect(
      await resolveAllowedSubaccounts({ userId: "a", role: "ADMIN" }),
    ).toBeNull();
    expect(
      await resolveAllowedSubaccounts({ userId: "s", role: "SUPER_ADMIN" }),
    ).toBeNull();
    expect(poolAuth.findMany).not.toHaveBeenCalled();
  });

  it("gives a client only their own Luxor subaccounts", async () => {
    poolAuth.findMany.mockResolvedValue(authKeys("acme_1", "acme_2"));
    expect(
      await resolveAllowedSubaccounts({ userId: "c1", role: "CLIENT" }),
    ).toEqual(["acme_1", "acme_2"]);
    expect(poolAuth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "c1", pool: { name: "Luxor" } },
      }),
    );
  });

  it("gives a franchisee their own plus their customers' subaccounts, de-duplicated", async () => {
    poolAuth.findMany.mockResolvedValue(authKeys("fr_own", "shared"));
    users.findMany.mockResolvedValue(
      customers(["cust_a", "shared"], ["cust_b", "cust_b_test"]),
    );
    expect(
      await resolveAllowedSubaccounts({ userId: "f1", role: "FRANCHISEE" }),
    ).toEqual(["fr_own", "shared", "cust_a", "cust_b"]);
  });

  it("gives a Guildmaster their own (the guild's) subaccounts", async () => {
    poolAuth.findMany.mockResolvedValue(authKeys("guild_1"));
    expect(
      await resolveAllowedSubaccounts({ userId: "gm", role: "GUILDMASTER" }),
    ).toEqual(["guild_1"]);
    expect(poolAuth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "gm", pool: { name: "Luxor" } },
      }),
    );
  });

  it("gives a Guildmember their guild's (the Guildmaster's) subaccounts", async () => {
    memberships.findFirst.mockResolvedValue({
      guild: { guildmasterId: "gm" },
    } as never);
    poolAuth.findMany.mockResolvedValue(authKeys("guild_1"));
    expect(
      await resolveAllowedSubaccounts({ userId: "m1", role: "GUILDMEMBER" }),
    ).toEqual(["guild_1"]);
    expect(poolAuth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "gm", pool: { name: "Luxor" } },
      }),
    );
  });

  it("gives a Guildmember who left their guild nothing of the guild's", async () => {
    memberships.findFirst.mockResolvedValue(null);
    poolAuth.findMany.mockResolvedValue([] as never);
    await resolveAllowedSubaccounts({ userId: "m1", role: "GUILDMEMBER" });
    expect(poolAuth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "m1", pool: { name: "Luxor" } },
      }),
    );
  });

  it("gives any other role nothing", async () => {
    expect(
      await resolveAllowedSubaccounts({ userId: "x", role: "SIMULATED" }),
    ).toEqual([]);
    expect(poolAuth.findMany).not.toHaveBeenCalled();
  });
});

describe("franchiseeCustomerSubaccountNames", () => {
  it("only asks for the franchisee's active CLIENT customers and skips _test", async () => {
    users.findMany.mockResolvedValue(customers(["a", "a_test"], ["b"]));
    expect(await franchiseeCustomerSubaccountNames("f1")).toEqual(["a", "b"]);
    expect(users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: "CLIENT",
          isDeleted: false,
          franchisee: { franchiseeId: "f1" },
        },
      }),
    );
  });
});

describe("parseRequestedSubaccounts", () => {
  it("merges all three parameters, splits, trims and de-duplicates", () => {
    const params = new URLSearchParams({
      subaccount_name: "a, b",
      subaccount_names: "b,c",
      subaccounts: " d ",
    });
    expect(parseRequestedSubaccounts(params)).toEqual(["a", "b", "c", "d"]);
  });

  it("treats 'all' and blanks as no request", () => {
    const params = new URLSearchParams({
      subaccounts: "all",
      subaccount_name: " , ",
    });
    expect(parseRequestedSubaccounts(params)).toEqual([]);
  });

  it("returns nothing when no parameter is present", () => {
    expect(parseRequestedSubaccounts(new URLSearchParams())).toEqual([]);
  });
});

describe("scopeRequestedSubaccounts", () => {
  it("defaults to everything allowed when nothing is requested", () => {
    expect(scopeRequestedSubaccounts(["a", "b"], [])).toEqual({
      ok: true,
      names: ["a", "b"],
    });
  });

  it("keeps a request that stays inside the allowed set", () => {
    expect(scopeRequestedSubaccounts(["a", "b"], ["b"])).toEqual({
      ok: true,
      names: ["b"],
    });
  });

  it("refuses the whole request if any name is someone else's", () => {
    expect(scopeRequestedSubaccounts(["a"], ["a", "other_customer"])).toEqual({
      ok: false,
      forbidden: ["other_customer"],
    });
  });

  it("refuses every name when nothing is allowed", () => {
    expect(scopeRequestedSubaccounts([], ["a"])).toEqual({
      ok: false,
      forbidden: ["a"],
    });
  });

  it("returns an empty list (not the site) when nothing is allowed or requested", () => {
    expect(scopeRequestedSubaccounts([], [])).toEqual({ ok: true, names: [] });
  });
});
