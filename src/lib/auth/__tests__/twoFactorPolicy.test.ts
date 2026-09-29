import { afterEach, describe, expect, it, vi } from "vitest";
import {
  twoFactorEnforceFrom,
  twoFactorRequirement,
} from "@/lib/auth/twoFactorPolicy";

const BEFORE = new Date("2026-10-01T00:00:00Z");
const AFTER = new Date("2026-10-20T00:00:00Z");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("twoFactorRequirement", () => {
  it.each(["SUPER_ADMIN", "ADMIN", "FRANCHISEE", "CLIENT"])(
    "applies to %s",
    (role) => {
      expect(twoFactorRequirement(role, false, BEFORE)).toBe("grace");
      expect(twoFactorRequirement(role, false, AFTER)).toBe("enforced");
    },
  );

  it("is satisfied once 2FA is enabled, before or after the deadline", () => {
    expect(twoFactorRequirement("ADMIN", true, BEFORE)).toBe("satisfied");
    expect(twoFactorRequirement("ADMIN", true, AFTER)).toBe("satisfied");
  });

  it("ignores unknown roles", () => {
    expect(twoFactorRequirement("SOMETHING_ELSE", false, AFTER)).toBe(
      "satisfied",
    );
  });

  it("switches exactly at the enforcement instant", () => {
    const at = twoFactorEnforceFrom();
    expect(
      twoFactorRequirement("CLIENT", false, new Date(at.getTime() - 1)),
    ).toBe("grace");
    expect(twoFactorRequirement("CLIENT", false, at)).toBe("enforced");
  });
});

describe("twoFactorEnforceFrom", () => {
  it("defaults to 2026-10-13 midnight UAE time", () => {
    expect(twoFactorEnforceFrom().toISOString()).toBe(
      "2026-10-12T20:00:00.000Z",
    );
  });

  it("can be moved with TWO_FACTOR_ENFORCE_FROM", () => {
    vi.stubEnv("TWO_FACTOR_ENFORCE_FROM", "2026-11-01T00:00:00Z");
    expect(twoFactorEnforceFrom().toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });

  it("falls back to the default when the env value is invalid", () => {
    vi.stubEnv("TWO_FACTOR_ENFORCE_FROM", "not-a-date");
    expect(twoFactorEnforceFrom().toISOString()).toBe(
      "2026-10-12T20:00:00.000Z",
    );
  });
});
