import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { isGuildRole } from "@/lib/customerRoles";
import { resolveDataOwnerId } from "@/lib/guildScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only: repair notes are created, updated and deleted only through
// Hardware Repair invoices (src/app/api/accounting/invoices/repair.ts).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const isCustomer = decoded.role === "CLIENT" || isGuildRole(decoded.role);
    if (!isStaffRole(decoded.role) && !isCustomer) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id: minerId } = await params;
    if (!minerId) {
      return NextResponse.json(
        { error: "Miner ID is required" },
        { status: 400 },
      );
    }

    // Clients may only read notes for their own miners (a Guildmember: the
    // guild's).
    if (isCustomer) {
      const miner = await prisma.miner.findUnique({
        where: { id: minerId },
        select: { userId: true },
      });
      if (!miner || miner.userId !== (await resolveDataOwnerId(decoded))) {
        return NextResponse.json({ error: "Miner not found" }, { status: 404 });
      }
    }

    const repairNotes = await prisma.minerRepairNote.findMany({
      where: { minerId },
      orderBy: { dateOfEntry: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: repairNotes },
      { status: 200 },
    );
  } catch (error) {
    console.error("Machine API [GET repair-notes] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
