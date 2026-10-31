/**
 * /api/repair-charges/[id] - ADMIN/SUPER_ADMIN/ACCOUNTING only.
 *
 * PUT: edit any of { repairType, priceType, amount, amountMax, note,
 *   linkUrl, isActive }. The body is merged onto the existing row and the
 *   result validated as a whole; the site can't be changed (delete and add
 *   instead). Display only - issued Hardware Repair invoices are unaffected.
 *
 * DELETE: removes the row. Nothing references a repair charge, so this is
 *   always allowed; deactivating hides it from clients without losing it.
 */

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
  touchRepairSite,
} from "@/lib/repairChargesServer";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRepairChargesUser(request, { staffOnly: true });
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { id } = await params;
    const existing = await prisma.repairCharge.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Repair charge not found" },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const before = serializeRepairCharge(existing);
    const parsed = parseRepairChargeInput({
      ...before,
      ...body,
      site: existing.site,
    });
    if ("error" in parsed) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 },
      );
    }

    const charge = await prisma.repairCharge.update({
      where: { id },
      data: parsed,
    });
    await touchRepairSite(existing.site);

    await prisma.auditLog.create({
      data: {
        action: AuditAction.REPAIR_CHARGE_UPDATED,
        entityType: "RepairCharge",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Repair charge ${existing.repairType} (${REPAIR_SITE_LABELS[existing.site]}) updated`,
        changes: JSON.stringify({ before, after: parsed }),
      },
    });

    return NextResponse.json({
      success: true,
      data: serializeRepairCharge(charge),
    });
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
    console.error("[Repair Charges API] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update repair charge" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRepairChargesUser(request, { staffOnly: true });
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { id } = await params;
    const existing = await prisma.repairCharge.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Repair charge not found" },
        { status: 404 },
      );
    }

    await prisma.repairCharge.delete({ where: { id } });
    await touchRepairSite(existing.site);

    await prisma.auditLog.create({
      data: {
        action: AuditAction.REPAIR_CHARGE_DELETED,
        entityType: "RepairCharge",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Repair charge ${existing.repairType} (${REPAIR_SITE_LABELS[existing.site]}) deleted`,
        changes: JSON.stringify({ before: serializeRepairCharge(existing) }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Repair Charges API] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete repair charge" },
      { status: 500 },
    );
  }
}
