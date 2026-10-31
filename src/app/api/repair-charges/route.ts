/**
 * /api/repair-charges
 *
 * Per-site repair price lists (Brazil, Ethiopia) shown to clients at
 * /repair-charges and managed by staff at /admin/repair-charges.
 *
 * GET: any signed-in user. { charges, settings }: active charges only,
 *   unless an ADMIN/SUPER_ADMIN/ACCOUNTING passes ?includeInactive=1.
 *   settings holds each site's hands & eyes fee and parts link.
 *
 * POST: staff only. Body: { site, repairType, priceType, amount?,
 *   amountMax?, note?, linkUrl?, isActive? }. Added at the end of the site's
 *   list.
 */

import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/accounting/adminAuth";
import {
  parseRepairChargeInput,
  REPAIR_SITE_LABELS,
} from "@/lib/repairCharges";
import {
  requireRepairChargesUser,
  serializeRepairCharge,
  serializeRepairSiteSetting,
  touchRepairSite,
} from "@/lib/repairChargesServer";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRepairChargesUser(request, { staffOnly: false });
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const includeInactive =
      isStaffRole(auth.decoded.role) &&
      request.nextUrl.searchParams.get("includeInactive") === "1";

    const [charges, settings] = await Promise.all([
      prisma.repairCharge.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: [{ site: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.repairSiteSetting.findMany(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        charges: charges.map(serializeRepairCharge),
        settings: settings.map(serializeRepairSiteSetting),
      },
    });
  } catch (error) {
    console.error("[Repair Charges API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch repair charges" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRepairChargesUser(request, { staffOnly: true });
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parseRepairChargeInput(body as Record<string, unknown>);
    if ("error" in parsed) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 },
      );
    }

    const last = await prisma.repairCharge.aggregate({
      where: { site: parsed.site },
      _max: { sortOrder: true },
    });

    const charge = await prisma.repairCharge.create({
      data: { ...parsed, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await touchRepairSite(parsed.site);

    await prisma.auditLog.create({
      data: {
        action: AuditAction.REPAIR_CHARGE_CREATED,
        entityType: "RepairCharge",
        entityId: charge.id,
        userId: auth.decoded.userId,
        description: `Repair charge ${parsed.repairType} added for ${REPAIR_SITE_LABELS[parsed.site]}`,
        changes: JSON.stringify({ after: parsed }),
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: serializeRepairCharge(charge),
        message: "Repair charge added",
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "This site already has a repair type with this name",
        },
        { status: 400 },
      );
    }
    console.error("[Repair Charges API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add repair charge" },
      { status: 500 },
    );
  }
}
