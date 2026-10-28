import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { guildMembership: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { rejectReadOnly, resolveDataOwnerId } from "@/lib/guildScope";
import {
  actsAsClient,
  isCustomerRole,
  isGuildRole,
  isReadOnlyRole,
} from "@/lib/customerRoles";

const memberships = vi.mocked(prisma.guildMembership);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveDataOwnerId", () => {
  it("returns the caller's own id for every role but GUILDMEMBER", async () => {
    for (const role of ["CLIENT", "GUILDMASTER", "ADMIN", "FRANCHISEE"]) {
      expect(await resolveDataOwnerId({ userId: "u1", role })).toBe("u1");
    }
    expect(memberships.findFirst).not.toHaveBeenCalled();
  });

  it("gives a Guildmember their guild's Guildmaster", async () => {
    memberships.findFirst.mockResolvedValue({
      guild: { guildmasterId: "gm" },
    } as never);
    expect(
      await resolveDataOwnerId({ userId: "m1", role: "GUILDMEMBER" }),
    ).toBe("gm");
    expect(memberships.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "m1", leftAt: null, guild: { deletedAt: null } },
      }),
    );
  });

  it("falls back to the member's own (empty) account without a guild", async () => {
    memberships.findFirst.mockResolvedValue(null);
    expect(
      await resolveDataOwnerId({ userId: "m1", role: "GUILDMEMBER" }),
    ).toBe("m1");
  });
});

describe("rejectReadOnly", () => {
  it("blocks only Guildmembers", async () => {
    const res = rejectReadOnly("GUILDMEMBER");
    expect(res?.status).toBe(403);
    expect(rejectReadOnly("GUILDMASTER")).toBeNull();
    expect(rejectReadOnly("CLIENT")).toBeNull();
  });
});

describe("customer role helpers", () => {
  it("classify the guild roles", () => {
    expect(isCustomerRole("GUILDMASTER")).toBe(true);
    expect(isCustomerRole("GUILDMEMBER")).toBe(true);
    expect(isCustomerRole("ADMIN")).toBe(false);
    expect(isGuildRole("GUILDMEMBER")).toBe(true);
    expect(isGuildRole("CLIENT")).toBe(false);
    expect(isReadOnlyRole("GUILDMEMBER")).toBe(true);
    expect(isReadOnlyRole("GUILDMASTER")).toBe(false);
    expect(actsAsClient("GUILDMASTER")).toBe(true);
    expect(actsAsClient("GUILDMEMBER")).toBe(false);
  });
});
