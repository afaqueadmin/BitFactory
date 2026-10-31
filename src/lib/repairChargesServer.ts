/**
 * Server-side pieces shared by the /api/repair-charges routes: auth checks
 * and Prisma row -> API shape (Decimal -> number).
 */

import { NextRequest } from "next/server";
import type {
  RepairCharge,
  RepairSite,
  RepairSiteSetting,
} from "@prisma/client";
import { isStaffRole } from "@/lib/auth/staffRoles";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import type {
  RepairChargeItem,
  RepairSiteSettingView,
} from "@/lib/repairCharges";

export async function requireRepairChargesUser(
  request: NextRequest,
  { staffOnly }: { staffOnly: boolean },
) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    if (staffOnly && !isStaffRole(decoded.role)) {
      return { error: "Admin access required", status: 403 as const };
    }
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

const toNumber = (v: { toNumber(): number } | null) =>
  v === null ? null : v.toNumber();

export function serializeRepairCharge(row: RepairCharge): RepairChargeItem {
  return {
    id: row.id,
    site: row.site,
    repairType: row.repairType,
    priceType: row.priceType,
    amount: toNumber(row.amount),
    amountMax: toNumber(row.amountMax),
    note: row.note,
    linkUrl: row.linkUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export function serializeRepairSiteSetting(
  row: RepairSiteSetting,
): RepairSiteSettingView {
  return {
    site: row.site,
    handsAndEyesFee: row.handsAndEyesFee.toNumber(),
    partsUrl: row.partsUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Stamps the site's RepairSiteSetting.updatedAt; the latest across sites is
 * the "last updated" date on the client page. Called after every charge change (add,
 * edit, hide, delete, reorder) - a delete leaves no row behind to carry the
 * date, so the site row does.
 */
export async function touchRepairSite(site: RepairSite) {
  await prisma.repairSiteSetting.updateMany({
    where: { site },
    data: { updatedAt: new Date() },
  });
}
