/**
 * GET /api/guild-requests - admin only. Every guild wallet, split and member
 * (add / remove) change request, newest first, optionally
 * ?status=PENDING|CONFIRMED|APPROVED|REJECTED, or OPEN for both still in
 * review (PENDING and CONFIRMED).
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma, RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { OPEN_REQUEST } from "@/lib/guilds/requests";

const userSelect = { select: { id: true, name: true, email: true } };

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const statusParam = request.nextUrl.searchParams.get("status");
    const status = Object.values(RequestStatus).includes(
      statusParam as RequestStatus,
    )
      ? (statusParam as RequestStatus)
      : undefined;
    const where: { status?: RequestStatus | Prisma.EnumRequestStatusFilter } =
      statusParam === "OPEN"
        ? { status: OPEN_REQUEST }
        : status
          ? { status }
          : {};

    const [wallet, split, member] = await Promise.all([
      prisma.guildWalletChangeRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          guild: { select: { id: true, name: true } },
          requestedBy: userSelect,
          confirmedBy: userSelect,
          reviewedBy: userSelect,
          membership: { include: { user: userSelect } },
        },
      }),
      prisma.guildSplitChangeRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          guild: { select: { id: true, name: true } },
          requestedBy: userSelect,
          confirmedBy: userSelect,
          reviewedBy: userSelect,
          lines: { include: { membership: { include: { user: userSelect } } } },
        },
      }),
      prisma.guildMemberChangeRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          guild: { select: { id: true, name: true } },
          requestedBy: userSelect,
          confirmedBy: userSelect,
          reviewedBy: userSelect,
          membership: { include: { user: userSelect } },
          lines: { include: { membership: { include: { user: userSelect } } } },
        },
      }),
    ]);

    const data = [
      ...wallet.map((r) => ({ kind: "wallet" as const, ...r })),
      ...split.map((r) => ({ kind: "split" as const, ...r })),
      ...member.map((r) => ({ kind: "member" as const, ...r })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Guild Requests API] GET error:", error);
    return jsonError("Failed to load guild requests", 500);
  }
}
