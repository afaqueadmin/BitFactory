/**
 * POST /api/machine/[id]/restarts
 *
 * Records that an admin restarted this miner from the Luxor backend. Nothing
 * is sent to Luxor - this only writes a MinerRestart history row plus a
 * MINER_RESTARTED audit log entry, in one transaction. ADMIN/SUPER_ADMIN only.
 *
 * Request Body:
 * {
 *   restartedAt: string (required) - ISO date-time the restart was done
 *   note?: string - optional free-text note
 *   alertId?: string - the hashrate alert it was recorded from, if any
 * }
 *
 * Recording a restart does not acknowledge the linked alert - that stays a
 * separate action.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return { error: "Admin access required", status: 403 as const };
    }
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const { restartedAt, note, alertId } = body ?? {};

    const restartedAtDate =
      typeof restartedAt === "string" ? new Date(restartedAt) : null;
    if (!restartedAtDate || Number.isNaN(restartedAtDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "restartedAt must be a valid date-time" },
        { status: 400 },
      );
    }

    if (note !== undefined && note !== null && typeof note !== "string") {
      return NextResponse.json(
        { success: false, error: "note must be a string" },
        { status: 400 },
      );
    }
    const trimmedNote =
      typeof note === "string" && note.trim() ? note.trim() : null;

    if (
      alertId !== undefined &&
      alertId !== null &&
      typeof alertId !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "alertId must be a string" },
        { status: 400 },
      );
    }

    const miner = await prisma.miner.findUnique({
      where: { id },
      select: { id: true, name: true, isDeleted: true },
    });
    if (!miner) {
      return NextResponse.json(
        { success: false, error: "Miner not found" },
        { status: 404 },
      );
    }
    if (miner.isDeleted) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot record a restart for a deleted miner",
        },
        { status: 400 },
      );
    }

    let alert: { id: string; date: Date } | null = null;
    if (alertId) {
      alert = await prisma.minerHashrateAlertLog.findFirst({
        where: { id: alertId, minerId: id },
        select: { id: true, date: true },
      });
      if (!alert) {
        return NextResponse.json(
          { success: false, error: "Alert not found for this miner" },
          { status: 404 },
        );
      }
    }

    const alertDate = alert ? alert.date.toISOString().slice(0, 10) : null;

    const restart = await prisma.$transaction(async (tx) => {
      const created = await tx.minerRestart.create({
        data: {
          minerId: id,
          alertId: alert?.id ?? null,
          restartedAt: restartedAtDate,
          note: trimmedNote,
          createdById: auth.decoded.userId,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.MINER_RESTARTED,
          entityType: "Miner",
          entityId: id,
          userId: auth.decoded.userId,
          description: `Miner ${miner.name} restarted at ${restartedAtDate.toISOString()}${
            alertDate ? ` (hashrate alert for ${alertDate})` : ""
          }`,
          changes: JSON.stringify({
            restartId: created.id,
            restartedAt: restartedAtDate.toISOString(),
            alertId: alert?.id ?? null,
            alertDate,
            note: trimmedNote,
          }),
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: restart }, { status: 201 });
  } catch (error) {
    console.error("[Miner Restarts API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to record miner restart" },
      { status: 500 },
    );
  }
}
