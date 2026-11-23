// singlesig only: the Trezor payout routes check permissions, not role names.
// Kept out of permissionParity.test.ts so merges from main don't conflict.
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  SA_ONLY,
  effectivePermissions,
  isGrantable,
} from "@/lib/auth/permissions";

const API = path.join(__dirname, "../../../app/api/guilds");
const ROUTES: Record<string, string[]> = {
  "trezor-payouts/route.ts": ["guilds.view", "guilds.record_payout"],
  "payout-trezor/route.ts": ["guilds.view", "guilds.edit_payout_settings"],
  "[id]/trezor-wallet/route.ts": ["guilds.view", "guilds.edit_payout_settings"],
};

describe("Trezor payout routes", () => {
  for (const [file, perms] of Object.entries(ROUTES)) {
    it(`${file} checks ${perms.join(", ")} and no role names`, () => {
      const src = fs.readFileSync(path.join(API, file), "utf8");
      expect(src).not.toMatch(/ADMIN_ROLES|requireStaff\(/);
      expect(src).toMatch(/authorizeStaff\(request, \["guilds\.view"\]\)/);
      for (const p of perms) {
        expect(isGrantable(p)).toBe(true);
        expect(src).toContain(`"${p}"`);
      }
    });
  }

  it("the moved Admin role (every grantable permission) can use them", () => {
    const admin = effectivePermissions(
      "STAFF",
      ALL_PERMISSIONS.filter((p) => !SA_ONLY.has(p)),
    );
    for (const perms of Object.values(ROUTES))
      for (const p of perms) expect(admin.has(p as never)).toBe(true);
  });

  it("a STAFF account without roles can't", () => {
    expect(effectivePermissions("STAFF", []).has("guilds.view")).toBe(false);
  });
});
