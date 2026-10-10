import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { REPAIR_MINER_SELECT } from "@/lib/accounting/hardwareRepair";

/**
 * GET /api/accounting/repair-miners?customerId=...
 *
 * Miners that can go on a Hardware Repair invoice for this customer: every
 * non-deleted miner they own, whatever its status (a miner in for repair is
 * often not AUTO), with the details shown on the invoice.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      ({ userId } = await verifyJwtToken(token));
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access miners" },
        { status: 403 },
      );
    }

    const customerId = new URL(request.url).searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json(
        { error: "Missing required parameter: customerId" },
        { status: 400 },
      );
    }

    const miners = await prisma.miner.findMany({
      where: { userId: customerId, isDeleted: false },
      select: { ...REPAIR_MINER_SELECT, status: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ miners });
  } catch (error) {
    console.error("Failed to fetch repair miners:", error);
    return NextResponse.json(
      { error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}
