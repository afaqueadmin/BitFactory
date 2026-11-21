import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

/**
 * Admin gate shared by all /api/memos/[id]/* routes (and imported by the
 * sibling audit-log/void/download routes), mirroring the requireAdmin()
 * convention in /api/admin/adjustments/[id]/route.ts.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, ["memos.view"]);
    if ("response" in auth) return auth.response;

    const { id } = await params;

    const memo = await prisma.memo.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        invoice: {
          select: { id: true, invoiceNumber: true, invoiceType: true },
        },
        createdByUser: { select: { id: true, name: true, email: true } },
        voidedByUser: { select: { id: true, name: true, email: true } },
        pairedMemo: { select: { id: true, memoNumber: true, category: true } },
      },
    });

    if (!memo) {
      return NextResponse.json({ error: "Memo not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, memo });
  } catch (error) {
    console.error("[Memos] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch memo" },
      { status: 500 },
    );
  }
}
