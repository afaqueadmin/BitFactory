import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { effectivePermissions } from "@/lib/auth/permissions";
import { canOpenPage, pagePermissions } from "@/lib/auth/pagePermissions";

const APP = path.join(__dirname, "../../../app");

/** Every staff page path, with [param] segments filled in. */
function managePages(): string[] {
  const root = path.join(APP, "(manage)");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") {
        const rel = path.relative(root, dir).split(path.sep).join("/");
        out.push(("/" + rel).replace(/\[[^\]]+\]/g, "x"));
      }
    }
  };
  walk(root);
  return out;
}

function sidebarPaths(): string[] {
  const src = fs.readFileSync(
    path.join(__dirname, "../../../components/admin/AdminSidebar.tsx"),
    "utf8",
  );
  return [...src.matchAll(/path: "(\/[^"]*)"/g)].map((m) => m[1]);
}

// Today every staff role opens every staff page, except /access-rules
// (SUPER_ADMIN only).
const SA_ONLY_PAGES = new Set(["/access-rules"]);

describe("page permission map", () => {
  const pages = managePages();

  it("finds the staff pages", () => {
    expect(pages.length).toBeGreaterThan(80);
  });

  it("covers every staff page", () => {
    expect(pages.filter((p) => pagePermissions(p) === null)).toEqual([]);
  });

  it("covers every sidebar link", () => {
    expect(sidebarPaths().filter((p) => pagePermissions(p) === null)).toEqual(
      [],
    );
  });

  it("refuses unknown pages", () => {
    expect(pagePermissions("/no-such-page")).toBeNull();
    expect(canOpenPage(["invoicing.view"], "/no-such-page")).toBe(false);
  });

  it("always opens the landing and own-account pages", () => {
    for (const p of ["/adminpanel", "/admin-profile", "/security-settings"])
      expect(canOpenPage([], p)).toBe(true);
  });

  it("uses the specific rule before the general one", () => {
    expect(pagePermissions("/accounting/create")).toEqual(["invoicing.create"]);
    expect(pagePermissions("/accounting/x/edit")).toEqual(["invoicing.edit"]);
    expect(pagePermissions("/accounting/expenses")).toEqual(["expenses.view"]);
    expect(pagePermissions("/accounting/x")).toEqual(["invoicing.view"]);
    expect(pagePermissions("/customers/x/wallet-email")).toEqual([
      "customers.send_wallet_email",
    ]);
  });

  for (const role of ["SUPER_ADMIN", "ADMIN", "ACCOUNTING"] as const) {
    it(`${role} opens the same pages as today`, () => {
      const perms = effectivePermissions(role, []);
      for (const p of pages) {
        const today = role === "SUPER_ADMIN" || !SA_ONLY_PAGES.has(p);
        expect(canOpenPage(perms, p), p).toBe(today);
      }
    });
  }

  it("STAFF with no custom roles opens only the always-open pages", () => {
    const perms = effectivePermissions("STAFF", []);
    expect(pages.filter((p) => canOpenPage(perms, p)).sort()).toEqual([
      "/admin-profile",
      "/adminpanel",
      "/security-settings",
    ]);
  });
});
