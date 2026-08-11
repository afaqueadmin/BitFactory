import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * Admin gate shared by all /api/memos/[id]/* routes (and imported by the
 * sibling audit-log/void/download routes), mirroring the requireAdmin()
 * convention in /api/admin/adjustments/[id]/route.ts.
 */

export type AdminAuthResult = { userId: string } | { error: NextResponse };

export async function requireAdmin(
  request: NextRequest,
): Promise<AdminAuthResult> {
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
    console.error("[Memos] Token verification failed:", error);
    return {
      error: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }

  if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Only administrators can manage memos" },
        { status: 403 },
      ),
    };
  }

  return { userId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return auth.error;

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
