import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20")),
    );
    const actionParam = searchParams.get("action");
    const entityType = searchParams.get("entityType") ?? undefined;
    const userId = searchParams.get("userId") ?? undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const q = searchParams.get("q")?.trim();

    const action =
      actionParam &&
      (Object.values(AuditAction) as string[]).includes(actionParam)
        ? (actionParam as AuditAction)
        : undefined;

    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(userId ? { userId } : {}),
      ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [logs, total, entityTypeRows] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
      // Unfiltered - populates the entity-type filter dropdown with every
      // value that actually exists, not just ones matching current filters.
      prisma.auditLog.findMany({
        distinct: ["entityType"],
        select: { entityType: true },
        orderBy: { entityType: "asc" },
      }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      entityTypes: entityTypeRows.map((r) => r.entityType),
    });
  } catch (error) {
    console.error("[Audit Log API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit log" },
      { status: 500 },
    );
  }
}
