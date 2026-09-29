import { beforeEach, describe, expect, it, vi } from "vitest";
import { compare } from "bcrypt";

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
  BACKUP_CODE_COUNT,
  consumeBackupCode,
  generateBackupCodes,
  hashBackupCodes,
  isHashedBackupCode,
  normalizeBackupCode,
} from "@/lib/auth/backupCodes";

const executeRaw = vi.mocked(prisma.$executeRaw);

beforeEach(() => {
  vi.clearAllMocks();
  executeRaw.mockResolvedValue(1 as never);
});

describe("generateBackupCodes", () => {
  it("generates 10 distinct 10-character codes from the unambiguous alphabet", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{10}$/);
    }
  });
});

describe("hashBackupCodes", () => {
  it("stores bcrypt hashes that verify against the plaintext", async () => {
    const [code] = generateBackupCodes(1);
    const [stored] = await hashBackupCodes([code]);
    expect(stored).not.toContain(code);
    expect(isHashedBackupCode(stored)).toBe(true);
    expect(await compare(code, stored)).toBe(true);
  });
});

describe("normalizeBackupCode", () => {
  it("ignores case, spaces and hyphens", () => {
    expect(normalizeBackupCode(" abcd-efgh 23 ")).toBe("ABCDEFGH23");
  });
});

describe("consumeBackupCode", () => {
  it("matches a hashed code and removes exactly that entry atomically", async () => {
    const stored = await hashBackupCodes(["AAAAAAAAAA", "BBBBBBBBBB"]);

    expect(await consumeBackupCode("u1", stored, "bbbbbbbbbb")).toBe(true);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    // Tagged-template call: [strings, ...values]; the values carry the match.
    const values = executeRaw.mock.calls[0].slice(1);
    expect(values).toContain(stored[1]);
    expect(values).toContain("u1");
  });

  it("matches a legacy plaintext code", async () => {
    expect(await consumeBackupCode("u1", ["AAAAAA", "BBBBBB"], "bbbbbb")).toBe(
      true,
    );
  });

  it("returns false without writing when nothing matches", async () => {
    const stored = await hashBackupCodes(["AAAAAAAAAA"]);
    expect(await consumeBackupCode("u1", stored, "CCCCCCCCCC")).toBe(false);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("returns false when a concurrent request already removed the code", async () => {
    executeRaw.mockResolvedValue(0 as never);
    const stored = await hashBackupCodes(["AAAAAAAAAA"]);
    expect(await consumeBackupCode("u1", stored, "AAAAAAAAAA")).toBe(false);
  });

  it("rejects empty and oversized input without comparing", async () => {
    expect(await consumeBackupCode("u1", ["AAAAAA"], " - ")).toBe(false);
    expect(await consumeBackupCode("u1", ["AAAAAA"], "A".repeat(100))).toBe(
      false,
    );
    expect(await consumeBackupCode("u1", [], "AAAAAA")).toBe(false);
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
