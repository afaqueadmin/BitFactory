import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const tx = { userLogin: { create: vi.fn() } };
  return {
    prisma: {
      user: { findFirst: vi.fn() },
      userLogin: { count: vi.fn(), delete: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});
vi.mock("bcrypt", () => ({ hash: vi.fn(async () => "hashed") }));
vi.mock("@/lib/jwt", () => ({
  signPasswordResetToken: vi.fn(async () => "tok"),
}));
vi.mock("@/lib/auth/passwordReset", () => ({
  passwordFingerprint: vi.fn(() => "fp"),
  resetLinkUrl: vi.fn(() => "https://x/reset"),
}));
vi.mock("@/lib/auth/securityAlerts", () => ({
  notifySecurityChange: vi.fn(async () => {}),
}));
vi.mock("@/lib/email", () => ({ sendLoginInviteEmail: vi.fn() }));
vi.mock("@/lib/auth/emailIdentity", () => ({
  canonicalEmail: (e: string) => e.trim().toLowerCase(),
  findDeletedHolder: vi.fn(),
  isEmailTaken: vi.fn(),
  isEmailUniqueViolation: vi.fn(() => false),
  releaseEmailFromDeletedAccount: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { sendLoginInviteEmail } from "@/lib/email";
import { notifySecurityChange } from "@/lib/auth/securityAlerts";
import {
  findDeletedHolder,
  isEmailTaken,
  releaseEmailFromDeletedAccount,
} from "@/lib/auth/emailIdentity";
import { addSecondaryLogin } from "@/lib/auth/addSecondaryLogin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;
const tx = p.__tx;

const base = {
  accountId: "acc1",
  email: " Second@X.com ",
  actor: { id: "admin1", role: "ADMIN", email: "admin@x.com" },
  releaseFromDeleted: false,
  headers: new Headers(),
  meta: { ipAddress: "1.1.1.1", userAgent: "ua" },
};

beforeEach(() => {
  vi.clearAllMocks();
  p.user.findFirst.mockResolvedValue({
    id: "acc1",
    role: "CLIENT",
    name: "Client",
    email: "client@x.com",
  });
  p.userLogin.count.mockResolvedValue(1);
  tx.userLogin.create.mockResolvedValue({
    id: "login2",
    email: "second@x.com",
    password: "hashed",
  });
  vi.mocked(findDeletedHolder).mockResolvedValue(null);
  vi.mocked(isEmailTaken).mockResolvedValue(false);
  vi.mocked(sendLoginInviteEmail).mockResolvedValue({ success: true } as never);
});

describe("addSecondaryLogin", () => {
  it("adds the login, invites it, audits and alerts the primary", async () => {
    const result = await addSecondaryLogin(base);
    expect(result).toEqual({
      ok: true,
      login: { id: "login2", email: "second@x.com" },
      message: expect.stringContaining("second@x.com"),
    });
    expect(tx.userLogin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "acc1",
          email: "second@x.com",
          isPrimary: false,
          createdById: "admin1",
        }),
      }),
    );
    expect(sendLoginInviteEmail).toHaveBeenCalledWith(
      "second@x.com",
      expect.anything(),
    );
    expect(p.auditLog.create).toHaveBeenCalled();
    expect(notifySecurityChange).toHaveBeenCalledWith(
      "client@x.com",
      { type: "LOGIN_ADDED", email: "second@x.com" },
      base.headers,
    );
  });

  it("refuses an account that already has two logins", async () => {
    p.userLogin.count.mockResolvedValue(2);
    const result = await addSecondaryLogin(base);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(tx.userLogin.create).not.toHaveBeenCalled();
  });

  it("refuses non-client accounts", async () => {
    p.user.findFirst.mockResolvedValue({
      id: "acc1",
      role: "FRANCHISEE",
      name: null,
      email: "f@x.com",
    });
    const result = await addSecondaryLogin(base);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses an email in use by a live account", async () => {
    vi.mocked(isEmailTaken).mockResolvedValue(true);
    const result = await addSecondaryLogin(base);
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: "Email is already in use",
    });
    expect(tx.userLogin.create).not.toHaveBeenCalled();
  });

  it("asks for confirmation when a deleted account holds the email", async () => {
    vi.mocked(findDeletedHolder).mockResolvedValue({
      userId: "old",
      name: "Old Co",
      loginId: "l9",
      isPrimary: true,
    });
    const result = await addSecondaryLogin(base);
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      code: "HELD_BY_DELETED_ACCOUNT",
      deletedAccountName: "Old Co",
    });
    expect(releaseEmailFromDeletedAccount).not.toHaveBeenCalled();
  });

  it("releases it from the deleted account once confirmed", async () => {
    vi.mocked(findDeletedHolder).mockResolvedValue({
      userId: "old",
      name: "Old Co",
      loginId: "l9",
      isPrimary: true,
    });
    const result = await addSecondaryLogin({
      ...base,
      releaseFromDeleted: true,
    });
    expect(result.ok).toBe(true);
    expect(releaseEmailFromDeletedAccount).toHaveBeenCalled();
    expect(isEmailTaken).not.toHaveBeenCalled();
  });

  it("removes the login again when the invite can't be sent", async () => {
    vi.mocked(sendLoginInviteEmail).mockResolvedValue({
      success: false,
    } as never);
    const result = await addSecondaryLogin(base);
    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(p.userLogin.delete).toHaveBeenCalledWith({
      where: { id: "login2" },
    });
    expect(notifySecurityChange).not.toHaveBeenCalled();
  });
});
