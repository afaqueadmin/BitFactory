import { beforeEach, describe, expect, it, vi } from "vitest";
import speakeasy from "speakeasy";
import { hash } from "bcrypt";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    twoFactorAuth: { update: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  recordUserFactorAttempt: vi.fn(),
  clearUserFactorAttempts: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  clearUserFactorAttempts,
  recordUserFactorAttempt,
} from "@/lib/rateLimit";
import { verifyStepUp } from "@/lib/auth/stepUp";

const findUser = vi.mocked(prisma.user.findUnique);
const updateTwoFactor = vi.mocked(prisma.twoFactorAuth.update);
const executeRaw = vi.mocked(prisma.$executeRaw);
const recordAttempt = vi.mocked(recordUserFactorAttempt);
const clearAttempts = vi.mocked(clearUserFactorAttempts);

const PASSWORD = "correct-horse-battery";
const ACTION = "add a passkey";

let passwordHash: string;

function userWithout2FA() {
  return { password: passwordHash, twoFactorAuth: null } as never;
}

function userWith2FA(secret: string, backupCodes: string[] = []) {
  return {
    password: passwordHash,
    twoFactorAuth: { enabled: true, secret, backupCodes },
  } as never;
}

beforeEach(async () => {
  vi.clearAllMocks();
  recordAttempt.mockResolvedValue({ allowed: true });
  passwordHash = await hash(PASSWORD, 4);
});

describe("verifyStepUp - account without 2FA", () => {
  it("returns 404 when the user does not exist", async () => {
    findUser.mockResolvedValue(null);

    expect(await verifyStepUp("u1", {}, ACTION)).toEqual({
      ok: false,
      status: 404,
      error: "User not found",
    });
  });

  it("asks for the password when none is supplied", async () => {
    findUser.mockResolvedValue(userWithout2FA());

    expect(await verifyStepUp("u1", {}, ACTION)).toEqual({
      ok: false,
      status: 400,
      error: "Your current password is required to add a passkey",
      code: "PASSWORD_REQUIRED",
    });
  });

  it("treats a non-string password as missing", async () => {
    findUser.mockResolvedValue(userWithout2FA());

    const result = await verifyStepUp("u1", { currentPassword: 12345 }, ACTION);

    expect(result).toMatchObject({ ok: false, code: "PASSWORD_REQUIRED" });
  });

  it("rejects a wrong password", async () => {
    findUser.mockResolvedValue(userWithout2FA());

    expect(
      await verifyStepUp("u1", { currentPassword: "nope" }, ACTION),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Current password is incorrect",
    });
  });

  it("accepts the correct password", async () => {
    findUser.mockResolvedValue(userWithout2FA());

    expect(
      await verifyStepUp("u1", { currentPassword: PASSWORD }, ACTION),
    ).toEqual({ ok: true, method: "PASSWORD" });
  });

  it("does not treat a disabled 2FA row as 2FA being on", async () => {
    findUser.mockResolvedValue({
      password: passwordHash,
      twoFactorAuth: { enabled: false, secret: null, backupCodes: [] },
    } as never);

    expect(
      await verifyStepUp("u1", { currentPassword: PASSWORD }, ACTION),
    ).toEqual({ ok: true, method: "PASSWORD" });
  });
});

describe("verifyStepUp - account with 2FA enabled", () => {
  const secret = speakeasy.generateSecret().base32;

  it("does not accept the correct password in place of a 2FA code", async () => {
    findUser.mockResolvedValue(userWith2FA(secret));

    expect(
      await verifyStepUp("u1", { currentPassword: PASSWORD }, ACTION),
    ).toEqual({
      ok: false,
      status: 400,
      error: "A 2FA code is required to add a passkey",
      code: "TWO_FACTOR_REQUIRED",
    });
    expect(updateTwoFactor).not.toHaveBeenCalled();
  });

  it("accepts a valid authenticator code and records the use", async () => {
    findUser.mockResolvedValue(userWith2FA(secret));
    const token = speakeasy.totp({ secret, encoding: "base32" });

    expect(await verifyStepUp("u1", { twoFactorToken: token }, ACTION)).toEqual(
      { ok: true, method: "2FA" },
    );
    expect(updateTwoFactor).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("rejects an invalid authenticator code without recording a use", async () => {
    findUser.mockResolvedValue(userWith2FA(secret));

    expect(
      await verifyStepUp("u1", { twoFactorToken: "000000x" }, ACTION),
    ).toEqual({
      ok: false,
      status: 400,
      error: "Invalid authentication code",
    });
    expect(updateTwoFactor).not.toHaveBeenCalled();
  });

  it("accepts a hashed backup code and consumes it", async () => {
    const hashed = [await hash("AAAAAAAAAA", 4), await hash("BBBBBBBBBB", 4)];
    findUser.mockResolvedValue(userWith2FA(secret, hashed));
    executeRaw.mockResolvedValue(1 as never);

    expect(
      await verifyStepUp("u1", { twoFactorToken: "aaaaa-aaaaa" }, ACTION),
    ).toEqual({ ok: true, method: "2FA" });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    // Removal is the atomic array_remove, not a read-modify-write update.
    expect(updateTwoFactor).not.toHaveBeenCalled();
  });

  it("still accepts a legacy plaintext backup code", async () => {
    findUser.mockResolvedValue(userWith2FA(secret, ["AAAAAA", "BBBBBB"]));
    executeRaw.mockResolvedValue(1 as never);

    expect(
      await verifyStepUp("u1", { twoFactorToken: "AAAAAA" }, ACTION),
    ).toEqual({ ok: true, method: "2FA" });
  });

  it("rejects a backup code already used by a concurrent request", async () => {
    findUser.mockResolvedValue(
      userWith2FA(secret, [await hash("AAAAAAAAAA", 4)]),
    );
    executeRaw.mockResolvedValue(0 as never);

    expect(
      await verifyStepUp("u1", { twoFactorToken: "AAAAAAAAAA" }, ACTION),
    ).toEqual({ ok: false, status: 400, error: "Invalid authentication code" });
  });
});

describe("verifyStepUp - attempt limit (N-1)", () => {
  const secret = speakeasy.generateSecret().base32;

  it("doesn't count a request that sends no credential", async () => {
    findUser.mockResolvedValue(userWithout2FA());
    await verifyStepUp("u1", {}, ACTION);
    findUser.mockResolvedValue(userWith2FA(secret));
    await verifyStepUp("u1", {}, ACTION);

    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("counts every submitted password or code under one shared scope", async () => {
    findUser.mockResolvedValue(userWithout2FA());
    await verifyStepUp("u1", { currentPassword: "nope" }, ACTION);
    findUser.mockResolvedValue(userWith2FA(secret));
    await verifyStepUp("u1", { twoFactorToken: "000000" }, "approve");

    expect(recordAttempt.mock.calls).toEqual([
      ["step_up", "u1"],
      ["step_up", "u1"],
    ]);
  });

  it("refuses once blocked, without checking the password", async () => {
    findUser.mockResolvedValue(userWithout2FA());
    recordAttempt.mockResolvedValue({
      allowed: false,
      status: 429,
      error:
        "Too many incorrect attempts. Please wait 3 minutes and try again.",
      retryAfterSeconds: 150,
    });

    expect(
      await verifyStepUp("u1", { currentPassword: PASSWORD }, ACTION),
    ).toEqual({
      ok: false,
      status: 429,
      error:
        "Too many incorrect attempts. Please wait 3 minutes and try again.",
    });
    expect(clearAttempts).not.toHaveBeenCalled();
  });

  it("refuses a correct 2FA code once blocked", async () => {
    findUser.mockResolvedValue(userWith2FA(secret));
    recordAttempt.mockResolvedValue({
      allowed: false,
      status: 503,
      error: "Couldn't verify right now. Please try again in a moment.",
    });
    const token = speakeasy.totp({ secret, encoding: "base32" });

    expect(
      await verifyStepUp("u1", { twoFactorToken: token }, ACTION),
    ).toMatchObject({ ok: false, status: 503 });
    expect(updateTwoFactor).not.toHaveBeenCalled();
  });

  it("clears the count after a success, not after a failure", async () => {
    findUser.mockResolvedValue(userWithout2FA());
    await verifyStepUp("u1", { currentPassword: "nope" }, ACTION);
    expect(clearAttempts).not.toHaveBeenCalled();

    await verifyStepUp("u1", { currentPassword: PASSWORD }, ACTION);
    expect(clearAttempts).toHaveBeenCalledWith("step_up", "u1");
  });
});
