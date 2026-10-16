/**
 * /api/firmware-options
 *
 * The admin-managed list of firmware a client can pick from when requesting
 * a firmware change on a miner (see /api/firmware-change-requests).
 *
 * GET: any signed-in user. Active options only, unless an ADMIN/SUPER_ADMIN
 *   passes ?includeInactive=1 - then every option, with a count of the
 *   requests that used it (an option with requests can't be deleted, only
 *   deactivated - see [id]/route.ts).
 *
 * POST: ADMIN/SUPER_ADMIN only. Body: { name }.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { isUniqueViolation } from "@/lib/accounting/adminAuth";
import { MAX_FIRMWARE_NAME_LENGTH } from "@/lib/constants/firmware";

async function requireUser(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const isAdmin =
      auth.decoded.role === "ADMIN" || auth.decoded.role === "SUPER_ADMIN";
    const includeInactive =
      isAdmin && request.nextUrl.searchParams.get("includeInactive") === "1";

    const options = await prisma.firmwareOption.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        ...(includeInactive && { _count: { select: { requests: true } } }),
      },
    });

    return NextResponse.json({ success: true, data: options });
  } catch (error) {
    console.error("[Firmware Options API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch firmware options" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }
    if (auth.decoded.role !== "ADMIN" && auth.decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name =
      typeof (body as { name?: unknown }).name === "string"
        ? (body as { name: string }).name.trim()
        : "";
    if (!name || name.length > MAX_FIRMWARE_NAME_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Name is required (max ${MAX_FIRMWARE_NAME_LENGTH} characters)`,
        },
        { status: 400 },
      );
    }

    const option = await prisma.firmwareOption.create({
      data: { name, createdById: auth.decoded.userId },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.FIRMWARE_OPTION_CREATED,
        entityType: "FirmwareOption",
        entityId: option.id,
        userId: auth.decoded.userId,
        description: `Firmware option ${name} added`,
      },
    });

    return NextResponse.json(
      { success: true, data: option, message: "Firmware option added" },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { success: false, error: "A firmware option with this name exists" },
        { status: 400 },
      );
    }
    console.error("[Firmware Options API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add firmware option" },
      { status: 500 },
    );
  }
}
