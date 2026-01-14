import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

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

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing required parameter: customerId" },
        { status: 400 },
      );
    }

    // Build where clause - fetch miners with status='AUTO' and not deleted
    const where: Record<string, unknown> = {
      userId: customerId,
      status: "AUTO",
      isDeleted: false,
    };

    // Fetch miners for the customer (only with status=AUTO)
    const miners = await prisma.miner.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Each miner counts as 1, so total is the count
    const totalActiveMiners = miners.length;

    return NextResponse.json({
      miners,
      totalActiveMiners,
    });
  } catch (error) {
    console.error("Failed to fetch miners:", error);
    return NextResponse.json(
      { error: "Failed to fetch miners" },
      { status: 500 },
    );
  }
}
