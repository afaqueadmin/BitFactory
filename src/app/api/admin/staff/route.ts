/**
 * GET /api/admin/staff
 *
 * Lists staff users (ADMIN/SUPER_ADMIN/ACCOUNTING), for the ticket-assignment
 * dropdown. SUPER_ADMIN only, matching /api/tickets/[id]/assign's restriction.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "tickets.assign");
    if (denied) return denied;

    const staff = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "SUPER_ADMIN", "ACCOUNTING", "STAFF"] },
        isDeleted: false,
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    console.error("[Admin Staff API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch staff" },
      { status: 500 },
    );
  }
}
