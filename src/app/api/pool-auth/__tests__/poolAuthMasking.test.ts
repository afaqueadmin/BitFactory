import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { poolAuth: { findMany } } }));
vi.mock("@/lib/auth/authorization", () => ({
  getAuthorizationContext: vi.fn().mockResolvedValue({ userId: "staff" }),
  requireAnyPermission: vi.fn().mockReturnValue(null),
  requirePermission: vi.fn().mockReturnValue(null),
}));

import { GET } from "@/app/api/pool-auth/route";
import {
  credentialLabel,
  groupSubaccountName,
  maskAuthKey,
} from "@/lib/poolAuthMask";

const TOKEN = "brn-secret-token-ab12";

beforeEach(() => vi.clearAllMocks());

describe("maskAuthKey (O3)", () => {
  it("keeps a Luxor subaccount name", () => {
    expect(maskAuthKey("Luxor", "kite01")).toEqual({
      authKey: "kite01",
      authKeyHint: null,
    });
  });

  it("never returns a Braiins token, only its last 4 characters", () => {
    expect(maskAuthKey("Braiins", TOKEN)).toEqual({
      authKey: null,
      authKeyHint: "ab12",
    });
  });

  it("gives no hint for a token too short to hide", () => {
    expect(maskAuthKey("Braiins", "abcd").authKeyHint).toBeNull();
  });

  it("labels and group copies never carry the token", () => {
    expect(credentialLabel("Braiins", TOKEN)).toBe("Braiins …ab12");
    expect(credentialLabel("Luxor", "kite01")).toBe("kite01");
    expect(groupSubaccountName("Braiins", TOKEN)).toBeNull();
    expect(groupSubaccountName("Luxor", "kite01")).toBe("kite01");
  });
});

describe("GET /api/pool-auth (O3)", () => {
  it("returns Luxor names but no Braiins token", async () => {
    findMany.mockResolvedValue([
      { id: "a", authKey: "kite01", pool: { id: "p1", name: "Luxor" } },
      { id: "b", authKey: TOKEN, pool: { id: "p2", name: "Braiins" } },
    ]);
    const res = await GET(
      new NextRequest("http://localhost/api/pool-auth?userId=u1"),
    );
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain(TOKEN);
    const { data } = JSON.parse(text);
    expect(data[0].authKey).toBe("kite01");
    expect(data[1]).toMatchObject({ authKey: null, authKeyHint: "ab12" });
  });
});
