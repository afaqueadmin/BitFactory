import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    // Admin-only: entries hold internal details such as the payment
    // account and exchange rate, which customers don't see (§2c P2-4).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can view invoice audit logs" },
        { status: 403 },
      );
    }

    // Fetch audit logs for this invoice
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityId: id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(auditLogs);
  } catch (error) {
    console.error("Get audit logs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 },
    );
  }
}
