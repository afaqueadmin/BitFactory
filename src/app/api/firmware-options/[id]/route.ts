/**
 * /api/firmware-options/[id] - ADMIN/SUPER_ADMIN/ACCOUNTING only.
 *
 * PUT: rename and/or activate/deactivate. Body: { name?, isActive? }.
 *   Renaming doesn't touch past requests - each one keeps its own snapshot
 *   (FirmwareChangeRequest.requestedFirmwareName).
 *
 * DELETE: only an option no request has used. One that has been used is
 *   refused with 409 - deactivate it instead, which hides it from clients.
 *   The FK from firmware_change_requests is Restrict, so the database
 *   enforces this too.
 */

import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { isUniqueViolation } from "@/lib/accounting/adminAuth";
import { MAX_FIRMWARE_NAME_LENGTH } from "@/lib/constants/firmware";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };
  try {
    const decoded = await verifyJwtToken(token);
    if (!isStaffRole(decoded.role)) {
      return { error: "Admin access required", status: 403 as const };
    }
    return { decoded };
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }
}

export async function PUT(
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
    const existing = await prisma.firmwareOption.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Firmware option not found" },
        { status: 404 },
      );
    }

    const body: { name?: unknown; isActive?: unknown } = await request
      .json()
      .catch(() => ({}));
    const data: { name?: string; isActive?: boolean } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > MAX_FIRMWARE_NAME_LENGTH) {
        return NextResponse.json(
          {
            success: false,
            error: `Name is required (max ${MAX_FIRMWARE_NAME_LENGTH} characters)`,
          },
          { status: 400 },
        );
      }
      data.name = name;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { success: false, error: "isActive must be true or false" },
          { status: 400 },
        );
      }
      data.isActive = body.isActive;
    }

    const option = await prisma.firmwareOption.update({
      where: { id },
      data,
    });

    const changes: string[] = [];
    if (data.name !== undefined && data.name !== existing.name) {
      changes.push(`renamed from ${existing.name} to ${data.name}`);
    }
    if (data.isActive !== undefined && data.isActive !== existing.isActive) {
      changes.push(data.isActive ? "activated" : "deactivated");
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.FIRMWARE_OPTION_UPDATED,
        entityType: "FirmwareOption",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Firmware option ${existing.name} ${changes.join(", ") || "updated"}`,
        changes: JSON.stringify({
          before: { name: existing.name, isActive: existing.isActive },
          after: data,
        }),
      },
    });

    return NextResponse.json({ success: true, data: option });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { success: false, error: "A firmware option with this name exists" },
        { status: 400 },
      );
    }
    console.error("[Firmware Options API] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update firmware option" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const existing = await prisma.firmwareOption.findUnique({
      where: { id },
      include: { _count: { select: { requests: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Firmware option not found" },
        { status: 404 },
      );
    }
    if (existing._count.requests > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This firmware option is used by firmware change requests. Deactivate it instead.",
        },
        { status: 409 },
      );
    }

    await prisma.firmwareOption.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.FIRMWARE_OPTION_DELETED,
        entityType: "FirmwareOption",
        entityId: id,
        userId: auth.decoded.userId,
        description: `Firmware option ${existing.name} deleted`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // A request was submitted against it between the count and the delete -
    // the Restrict FK refused the delete.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This firmware option is used by firmware change requests. Deactivate it instead.",
        },
        { status: 409 },
      );
    }
    console.error("[Firmware Options API] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete firmware option" },
      { status: 500 },
    );
  }
}
