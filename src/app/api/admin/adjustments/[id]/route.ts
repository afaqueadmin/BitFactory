import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";

/**
 * Edit/delete for a single ADJUSTMENT-type CostPayment, used by the Credit
 * Adjustments admin page. Scoped to type === "ADJUSTMENT" only (unlike the
 * generic /api/accounting/payments/[id] route) so this can never touch a
 * PAYMENT / ELECTRICITY_CHARGES / HARDWARE_SALES row that's tied to an
 * invoice.
 */

type AdminAuthResult = { userId: string } | { error: NextResponse };

async function requireAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let userId: string;
  let userRole: string;
  try {
    const decoded = await verifyJwtToken(token);
    userId = decoded.userId;
    userRole = decoded.role;
  } catch (error) {
    console.error("[Admin Adjustments] Token verification failed:", error);
    return {
      error: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }

  if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Only administrators can manage adjustments" },
        { status: 403 },
      ),
    };
  }

  return { userId };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const { amount, narration } = await request.json();

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount === 0
    ) {
      return NextResponse.json(
        { error: "Amount must be a non-zero number" },
        { status: 400 },
      );
    }

    if (
      !narration ||
      typeof narration !== "string" ||
      narration.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Narration is required" },
        { status: 400 },
      );
    }

    if (narration.length > 500) {
      return NextResponse.json(
        { error: "Narration must not exceed 500 characters" },
        { status: 400 },
      );
    }

    const existing = await prisma.costPayment.findUnique({ where: { id } });

    if (!existing || existing.isDeleted) {
      return NextResponse.json(
        { error: "Adjustment not found" },
        { status: 404 },
      );
    }

    if (existing.type !== "ADJUSTMENT") {
      return NextResponse.json(
        { error: "Only ADJUSTMENT transactions can be edited here" },
        { status: 400 },
      );
    }

    const updated = await prisma.costPayment.update({
      where: { id },
      data: { amount, narration: narration.trim() },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_ADDED,
        entityType: "CostPayment",
        entityId: id,
        userId: auth.userId,
        description: `Adjustment updated for user ${existing.userId}`,
        changes: JSON.stringify({
          before: { amount: existing.amount, narration: existing.narration },
          after: { amount: updated.amount, narration: updated.narration },
        }),
      },
    });

    return NextResponse.json({ success: true, payment: updated });
  } catch (error) {
    console.error("[Admin Adjustments] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update adjustment" },
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
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const existing = await prisma.costPayment.findUnique({ where: { id } });

    if (!existing || existing.isDeleted) {
      return NextResponse.json(
        { error: "Adjustment not found" },
        { status: 404 },
      );
    }

    if (existing.type !== "ADJUSTMENT") {
      return NextResponse.json(
        { error: "Only ADJUSTMENT transactions can be deleted here" },
        { status: 400 },
      );
    }

    await prisma.costPayment.update({
      where: { id },
      data: { isDeleted: true },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_REMOVED,
        entityType: "CostPayment",
        entityId: id,
        userId: auth.userId,
        description: `Adjustment removed for user ${existing.userId}`,
        changes: JSON.stringify({
          amount: existing.amount,
          narration: existing.narration,
        }),
      },
    });

    return NextResponse.json({ success: true, message: "Adjustment deleted" });
  } catch (error) {
    console.error("[Admin Adjustments] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete adjustment" },
      { status: 500 },
    );
  }
}
