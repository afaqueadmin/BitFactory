import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    userLogin: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  canonicalEmail,
  findDeletedHolder,
  isEmailTaken,
  isEmailUniqueViolation,
  isReleasedEmail,
  releasedEmail,
} from "@/lib/auth/emailIdentity";

const findFirst = vi.mocked(prisma.user.findFirst);
const findLogin = vi.mocked(prisma.userLogin.findFirst);

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
  beforeEach(() => {
    findFirst.mockResolvedValue(null);
    findLogin.mockResolvedValue(null);
  });

  it("looks up the canonical email exactly, including soft-deleted accounts", async () => {
    await isEmailTaken(" John@X.com ");
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: "john@x.com" },
      select: { id: true },
    });
    expect(findLogin).toHaveBeenCalledWith({
      where: { email: "john@x.com" },
      select: { id: true },
    });
  });

  it("excludes the account being edited, but not its secondary login", async () => {
    await isEmailTaken("john@x.com", "u1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: "john@x.com", NOT: { id: "u1" } },
      select: { id: true },
    });
    expect(findLogin).toHaveBeenCalledWith({
      where: { email: "john@x.com", NOT: { userId: "u1", isPrimary: true } },
      select: { id: true },
    });
  });

  it("returns true when a matching account exists", async () => {
    findFirst.mockResolvedValue({ id: "u2" } as never);
    expect(await isEmailTaken("john@x.com")).toBe(true);
  });

  it("returns true when it's another account's secondary sign-in email", async () => {
    findLogin.mockResolvedValue({ id: "l2" } as never);
    expect(await isEmailTaken("john@x.com")).toBe(true);
  });

  it("returns false when none exists", async () => {
    expect(await isEmailTaken("john@x.com")).toBe(false);
  });
});

describe("findDeletedHolder", () => {
  const deletedUser = { id: "u9", name: "Old Co", isDeleted: true };

  beforeEach(() => {
    findFirst.mockResolvedValue(null);
    findLogin.mockResolvedValue(null);
  });

  it("returns null when nobody holds the email", async () => {
    expect(await findDeletedHolder("john@x.com")).toBeNull();
  });

  it("returns the deleted account holding it as its primary email", async () => {
    findFirst.mockResolvedValue(deletedUser as never);
    findLogin.mockResolvedValue({
      id: "l9",
      isPrimary: true,
      user: deletedUser,
    } as never);
    expect(await findDeletedHolder(" John@X.com ")).toEqual({
      userId: "u9",
      name: "Old Co",
      loginId: "l9",
      isPrimary: true,
    });
  });

  it("returns the deleted account holding it as a second sign-in email", async () => {
    findLogin.mockResolvedValue({
      id: "l8",
      isPrimary: false,
      user: deletedUser,
    } as never);
    expect(await findDeletedHolder("john@x.com")).toEqual({
      userId: "u9",
      name: "Old Co",
      loginId: "l8",
      isPrimary: false,
    });
  });

  it("returns null when a live account holds it", async () => {
    findFirst.mockResolvedValue({ ...deletedUser, isDeleted: false } as never);
    expect(await findDeletedHolder("john@x.com")).toBeNull();
  });

  it("returns null when a live account's login holds it", async () => {
    findLogin.mockResolvedValue({
      id: "l8",
      isPrimary: false,
      user: { ...deletedUser, isDeleted: false },
    } as never);
    expect(await findDeletedHolder("john@x.com")).toBeNull();
  });
});

describe("releasedEmail / isReleasedEmail", () => {
  it("marks the email and is recognised", () => {
    const placeholder = releasedEmail("john@x.com", "cmabc123456");
    expect(placeholder).toBe("john@x.com#released-123456");
    expect(isReleasedEmail(placeholder)).toBe(true);
    expect(isReleasedEmail("john@x.com")).toBe(false);
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
