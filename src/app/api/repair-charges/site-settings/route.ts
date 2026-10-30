/**
 * PUT /api/repair-charges/site-settings - ADMIN/SUPER_ADMIN/ACCOUNTING only.
 *
 * Body: { site, handsAndEyesFee, partsUrl? }. Upserts the site's flat hands
 * & eyes fee (applies to every repair) and its parts shop link.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseRepairSiteSettingInput,
  REPAIR_SITE_LABELS,
} from "@/lib/repairCharges";
import {
  requireRepairChargesUser,
  serializeRepairSiteSetting,
} from "@/lib/repairChargesServer";

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRepairChargesUser(request, { staffOnly: true });
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parseRepairSiteSettingInput(body as Record<string, unknown>);
    if ("error" in parsed) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 },
      );
    }

    const existing = await prisma.repairSiteSetting.findUnique({
      where: { site: parsed.site },
    });
    const { site, ...values } = parsed;
    const setting = await prisma.repairSiteSetting.upsert({
      where: { site },
      create: parsed,
      update: values,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.REPAIR_SITE_SETTING_UPDATED,
        entityType: "RepairSiteSetting",
        entityId: site,
        userId: auth.decoded.userId,
        description: `Repair settings for ${REPAIR_SITE_LABELS[site]} updated`,
        changes: JSON.stringify({
          before: existing ? serializeRepairSiteSetting(existing) : null,
          after: parsed,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: serializeRepairSiteSetting(setting),
    });
  } catch (error) {
    console.error("[Repair Charges API] site-settings error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save repair settings" },
      { status: 500 },
    );
  }
}
