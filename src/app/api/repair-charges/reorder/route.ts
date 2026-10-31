/**
 * PUT /api/repair-charges/reorder - ADMIN/SUPER_ADMIN/ACCOUNTING only.
 *
 * Body: { site, ids }: every charge id of that site, in the new display
 * order. Rewrites sortOrder 1..n in one transaction.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRepairSite } from "@/lib/repairCharges";
import {
  requireRepairChargesUser,
  touchRepairSite,
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

    const body = (await request.json().catch(() => ({}))) as {
      site?: unknown;
      ids?: unknown;
    };
    const ids = body.ids;
    if (
      !isRepairSite(body.site) ||
      !Array.isArray(ids) ||
      !ids.every((id) => typeof id === "string")
    ) {
      return NextResponse.json(
        { success: false, error: "Body must be { site, ids: string[] }" },
        { status: 400 },
      );
    }

    // The list must be exactly the site's charges - a stale page (a row
    // added or deleted elsewhere) is refused rather than half-applied.
    const current = await prisma.repairCharge.findMany({
      where: { site: body.site },
      select: { id: true },
    });
    const currentIds = new Set(current.map((c) => c.id));
    if (
      ids.length !== currentIds.size ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => currentIds.has(id))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "The list has changed - refresh the page and try again",
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(
      (ids as string[]).map((id, i) =>
        prisma.repairCharge.update({
          where: { id },
          data: { sortOrder: i + 1 },
        }),
      ),
    );
    await touchRepairSite(body.site);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Repair Charges API] reorder error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reorder repair charges" },
      { status: 500 },
    );
  }
}
