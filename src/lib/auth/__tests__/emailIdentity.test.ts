import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  canonicalEmail,
  isEmailTaken,
  isEmailUniqueViolation,
} from "@/lib/auth/emailIdentity";

const findFirst = vi.mocked(prisma.user.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canonicalEmail", () => {
  it("lowercases and trims", () => {
    expect(canonicalEmail("  John.Doe@Example.COM ")).toBe(
      "john.doe@example.com",
    );
  });

  it("keeps dots in the local part significant", () => {
    expect(canonicalEmail("john.doe@x.com")).not.toBe(
      canonicalEmail("johndoe@x.com"),
    );
  });

  it("leaves LIKE wildcards as literal characters", () => {
    expect(canonicalEmail("a_b%c@x.com")).toBe("a_b%c@x.com");
  });
});

describe("isEmailTaken", () => {
  it("looks up the canonical email exactly, including soft-deleted accounts", async () => {
    findFirst.mockResolvedValue(null);
    await isEmailTaken(" John@X.com ");
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: "john@x.com" },
      select: { id: true },
    });
  });

  it("excludes the account being edited", async () => {
    findFirst.mockResolvedValue(null);
    await isEmailTaken("john@x.com", "u1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: "john@x.com", NOT: { id: "u1" } },
      select: { id: true },
    });
  });

  it("returns true when a matching account exists", async () => {
    findFirst.mockResolvedValue({ id: "u2" } as never);
    expect(await isEmailTaken("john@x.com")).toBe(true);
  });

  it("returns false when none exists", async () => {
    findFirst.mockResolvedValue(null);
    expect(await isEmailTaken("john@x.com")).toBe(false);
  });
});

describe("isEmailUniqueViolation", () => {
  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    });

  it("matches P2002 on the email column", () => {
    expect(isEmailUniqueViolation(p2002(["email"]))).toBe(true);
  });

  it("matches P2002 on the lower(email) index by name", () => {
    expect(isEmailUniqueViolation(p2002("users_email_lower_key"))).toBe(true);
  });

  it("ignores P2002 on other columns", () => {
    expect(isEmailUniqueViolation(p2002(["franchiseCode"]))).toBe(false);
  });

  it("ignores other errors", () => {
    expect(isEmailUniqueViolation(new Error("boom"))).toBe(false);
  });
});
