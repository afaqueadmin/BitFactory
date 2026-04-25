import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20")),
    );
    const userId = searchParams.get("userId") ?? undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where = {
      ...(userId ? { userId } : {}),
      ...(dateFrom || dateTo
        ? {
            loginAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.userSession.findMany({
        where,
        include: {
          user: {
            select: { name: true, email: true, luxorSubaccountName: true },
          },
          tabVisits: { orderBy: { visitedAt: "asc" } },
        },
        orderBy: { loginAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userSession.count({ where }),
    ]);

    // Aggregate stats: sessions today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalSessionsToday, durationAgg, tabCounts] = await Promise.all([
      prisma.userSession.count({ where: { loginAt: { gte: todayStart } } }),
      prisma.userSession.aggregate({
        _avg: { duration: true },
        where: { duration: { not: null } },
      }),
      prisma.tabVisit.groupBy({
        by: ["tabKey", "tabName"],
        _count: { tabKey: true },
        orderBy: { _count: { tabKey: "desc" } },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      sessions,
      total,
      page,
      limit,
      stats: {
        totalSessionsToday,
        avgDurationSeconds: Math.round(durationAgg._avg.duration ?? 0),
        topTabs: tabCounts.map((t) => ({
          tabKey: t.tabKey,
          tabName: t.tabName,
          count: t._count.tabKey,
        })),
      },
    });
  } catch (error) {
    console.error("Activity log error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
