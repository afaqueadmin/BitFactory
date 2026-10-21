import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSimAdmin } from "@/lib/simulation/adminAuth";

export const runtime = "nodejs";

/**
 * DELETE /api/simulated-accounts/[id]/entries/[entryId]  (ADMIN / SUPER_ADMIN /
 * ACCOUNTING)
 *
 * Voids one simulated ledger entry (soft delete). A voided daily charge
 * keeps its day, so the cron won't charge that day again.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const auth = await requireSimAdmin(request);
    if ("response" in auth) return auth.response;

    const { id, entryId } = await params;
    const entry = await prisma.simulatedCostPayment.findFirst({
      where: {
        id: entryId,
        userId: id,
        isDeleted: false,
        user: { role: "SIMULATED" },
      },
      select: { id: true, amount: true, type: true, narration: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.simulatedCostPayment.update({
        where: { id: entryId },
        data: { isDeleted: true },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.PAYMENT_REMOVED,
          entityType: "SimulatedCostPayment",
          entityId: entryId,
          userId: auth.actorId,
          description: "Simulated ledger entry removed",
          changes: JSON.stringify({ simulatedUserId: id, ...entry }),
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Simulated Entries API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to remove the entry" },
      { status: 500 },
    );
  }
}
