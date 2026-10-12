import { NextRequest, NextResponse } from "next/server";
import {
  EmailRunKind,
  EmailRunSource,
  EmailRunStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";

const KINDS = Object.values(EmailRunKind) as string[];
const SOURCES = Object.values(EmailRunSource) as string[];
const STATUSES = Object.values(EmailRunStatus) as string[];

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * GET /api/accounting/email-runs
 *
 * Filters: type (invoice type, omit or "all" for every type), kind, source,
 * status, from / to (ISO timestamps on startedAt; the page sends the
 * viewer's local day bounds), createdBy, page, limit.
 * Returns the page of runs, KPIs for the whole filtered set and the list of
 * admins who have created runs (for the creator filter).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const params = request.nextUrl.searchParams;
    const type = params.get("type");
    const kind = params.get("kind");
    const source = params.get("source");
    const status = params.get("status");
    const createdBy = params.get("createdBy");
    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"));
    const page = Math.max(1, parseInt(params.get("page") || "1") || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(params.get("limit") || "25") || 25),
    );

    const where: Prisma.EmailSendRunWhereInput = {};
    if (type && type !== "all") where.type = type;
    if (kind && KINDS.includes(kind)) where.kind = kind as EmailRunKind;
    if (source && SOURCES.includes(source)) {
      where.source = source as EmailRunSource;
    }
    if (status && STATUSES.includes(status)) {
      where.status = status as EmailRunStatus;
    }
    if (createdBy) where.createdBy = createdBy;
    if (from || to) {
      where.startedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const [runs, total, totals, creatorIds] = await Promise.all([
      prisma.emailSendRun.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailSendRun.count({ where }),
      prisma.emailSendRun.aggregate({
        where,
        _sum: { successCount: true, failureCount: true },
      }),
      prisma.emailSendRun.groupBy({ by: ["createdBy"] }),
    ]);

    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds.map((c) => c.createdBy) } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    const sent = totals._sum.successCount ?? 0;
    const failed = totals._sum.failureCount ?? 0;

    return NextResponse.json({
      success: true,
      data: runs.map((run) => ({
        id: run.id,
        type: run.type,
        kind: run.kind,
        source: run.source,
        status: run.status,
        totalInvoices: run.totalInvoices,
        successCount: run.successCount,
        failureCount: run.failureCount,
        createdBy: run.creator,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      })),
      summary: {
        runs: total,
        sent,
        failed,
        successRate:
          sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : null,
      },
      creators,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get email runs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch email runs" },
      { status: 500 },
    );
  }
}
