import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/auth/emailIdentity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/emailIdentity")>()),
  isEmailTaken: vi.fn(),
}));

import { isEmailTaken } from "@/lib/auth/emailIdentity";
import {
  checkMemberRequestStillValid,
  validateMemberRequest,
  validateSplit,
} from "@/lib/guilds/requests";
import { diffMembers, type MemberSnapshot } from "@/lib/guilds/audit";

const taken = vi.mocked(isEmailTaken);
const WALLET = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

const active = [
  { id: "master", isGuildmaster: true },
  { id: "a", isGuildmaster: false },
  { id: "b", isGuildmaster: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  taken.mockResolvedValue(false);
});

describe("validateSplit with a person being added", () => {
  it("counts the extra percent in the 100%", () => {
    const lines = [
      { membershipId: "master", percent: 50 },
      { membershipId: "a", percent: 30 },
      { membershipId: "b", percent: 10 },
    ];
    expect(validateSplit(lines, ["master", "a", "b"], 10)).toHaveLength(3);
    expect(() => validateSplit(lines, ["master", "a", "b"], 5)).toThrow(
      "exactly 100%",
    );
  });
});

describe("validateMemberRequest", () => {
  it("accepts an add with every current member's new %", () => {
    const r = validateMemberRequest(
      "member-add",
      {
        person: {
          name: "New",
          email: "New@Example.com",
          percent: 10,
          walletAddress: WALLET,
        },
        lines: [
          { membershipId: "master", percent: 50 },
          { membershipId: "a", percent: 30 },
          { membershipId: "b", percent: 10 },
        ],
      },
      active,
    );
    expect(r.action).toBe("ADD");
    if (r.action === "ADD") {
      expect(r.person.email).toBe("new@example.com");
      expect(r.person.walletAddress).toBe(WALLET);
    }
  });

  it("rejects an add that leaves a current member out", () => {
    expect(() =>
      validateMemberRequest(
        "member-add",
        {
          person: { name: "New", email: "n@example.com", percent: 50 },
          lines: [{ membershipId: "master", percent: 50 }],
        },
        active,
      ),
    ).toThrow("every guild member");
  });

  it("rejects an invalid wallet on an add", () => {
    expect(() =>
      validateMemberRequest(
        "member-add",
        {
          person: {
            name: "New",
            email: "n@example.com",
            percent: 10,
            walletAddress: "bc1qnotvalid",
          },
          lines: [],
        },
        active,
      ),
    ).toThrow("valid");
  });

  it("accepts a removal with the remaining members' %", () => {
    const r = validateMemberRequest(
      "member-remove",
      {
        membershipId: "b",
        lines: [
          { membershipId: "master", percent: 60 },
          { membershipId: "a", percent: 40 },
        ],
      },
      active,
    );
    expect(r).toMatchObject({ action: "REMOVE", membershipId: "b" });
  });

  it("refuses to remove the Guildmaster", () => {
    expect(() =>
      validateMemberRequest(
        "member-remove",
        { membershipId: "master", lines: [] },
        active,
      ),
    ).toThrow("Guildmaster can't be removed");
  });

  it("refuses a removal whose split still lists the leaver", () => {
    expect(() =>
      validateMemberRequest(
        "member-remove",
        {
          membershipId: "b",
          lines: [
            { membershipId: "master", percent: 50 },
            { membershipId: "a", percent: 40 },
            { membershipId: "b", percent: 10 },
          ],
        },
        active,
      ),
    ).toThrow("every guild member");
  });
});

describe("checkMemberRequestStillValid", () => {
  const d = (n: number) => new Prisma.Decimal(n);
  const db = (members: { id: string; isGuildmaster: boolean }[]) =>
    ({
      guildMembership: { findMany: vi.fn().mockResolvedValue(members) },
    }) as unknown as Prisma.TransactionClient;

  const addRequest = {
    guildId: "g",
    action: "ADD" as const,
    newEmail: "n@example.com",
    newPercent: d(10),
    membershipId: null,
    lines: [
      { membershipId: "master", requestedPercent: d(50) },
      { membershipId: "a", requestedPercent: d(30) },
      { membershipId: "b", requestedPercent: d(10) },
    ],
  };
  const removeRequest = {
    guildId: "g",
    action: "REMOVE" as const,
    newEmail: null,
    newPercent: null,
    membershipId: "b",
    lines: [
      { membershipId: "master", requestedPercent: d(60) },
      { membershipId: "a", requestedPercent: d(40) },
    ],
  };

  it("returns the split when nothing changed", async () => {
    await expect(
      checkMemberRequestStillValid(db(active), addRequest),
    ).resolves.toHaveLength(3);
    await expect(
      checkMemberRequestStillValid(db(active), removeRequest),
    ).resolves.toHaveLength(2);
  });

  it("refuses an add when the members changed since", async () => {
    await expect(
      checkMemberRequestStillValid(
        db([...active, { id: "c", isGuildmaster: false }]),
        addRequest,
      ),
    ).rejects.toThrow("members changed");
  });

  it("refuses an add when the email was taken since", async () => {
    taken.mockResolvedValue(true);
    await expect(
      checkMemberRequestStillValid(db(active), addRequest),
    ).rejects.toThrow("already in use now");
  });

  it("skips the email check once the account was created for it", async () => {
    taken.mockResolvedValue(true);
    await expect(
      checkMemberRequestStillValid(db(active), addRequest, {
        checkEmail: false,
      }),
    ).resolves.toHaveLength(3);
  });

  it("refuses a removal when the member already left", async () => {
    await expect(
      checkMemberRequestStillValid(db(active.slice(0, 2)), removeRequest),
    ).rejects.toThrow("already left");
  });

  it("refuses a removal when the member became the Guildmaster", async () => {
    await expect(
      checkMemberRequestStillValid(
        db([
          { id: "master", isGuildmaster: false },
          { id: "a", isGuildmaster: false },
          { id: "b", isGuildmaster: true },
        ]),
        removeRequest,
      ),
    ).rejects.toThrow("now the Guildmaster");
  });
});

describe("diffMembers", () => {
  const snap = (
    id: string,
    percent: number,
    wallet: string | null = null,
  ): MemberSnapshot => ({
    membershipId: id,
    userId: `u-${id}`,
    name: id,
    email: `${id}@example.com`,
    isGuildmaster: id === "master",
    percent,
    wallet,
  });

  it("records joins, leaves, % changes and wallets", () => {
    const changes = diffMembers(
      [snap("master", 60), snap("a", 30, "w-a"), snap("b", 10)],
      [snap("master", 70), snap("a", 30, "w-a"), snap("c", 0, "w-c")],
    );
    expect(changes).toEqual([
      expect.objectContaining({
        membershipId: "master",
        percent: { from: 60, to: 70 },
      }),
      expect.objectContaining({
        membershipId: "a",
        percent: { from: 30, to: 30 },
      }),
      expect.objectContaining({
        membershipId: "b",
        percent: { from: 10, to: null },
      }),
      expect.objectContaining({
        membershipId: "c",
        percent: { from: null, to: 0 },
        wallet: { from: null, to: "w-c" },
      }),
    ]);
    expect(changes[1].wallet).toBeUndefined();
    expect(changes[2].wallet).toBeUndefined();
  });
});
