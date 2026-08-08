import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { generateMemoPDF } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);

    const memo = await prisma.memo.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });

    if (!memo) {
      return NextResponse.json({ error: "Memo not found" }, { status: 404 });
    }

    const requester = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    const isAdmin =
      requester?.role === "ADMIN" || requester?.role === "SUPER_ADMIN";
    const isOwnMemo = memo.userId === decoded.userId;

    if (!isAdmin && !isOwnMemo) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (memo.memoType !== "CUSTOMER_FACING") {
      return NextResponse.json(
        { error: "Only customer-facing memos have a PDF" },
        { status: 400 },
      );
    }

    const pdfBuffer = await generateMemoPDF({
      memoNumber: memo.memoNumber,
      customerName: memo.user?.name || "Valued Customer",
      customerEmail: memo.user?.email || "",
      category: memo.category,
      amount: Number(memo.amount),
      reason: memo.reason,
      issuedDate: memo.issuedDate,
      invoiceNumber: memo.invoice?.invoiceNumber || null,
    });

    return new NextResponse(pdfBuffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="memo-${memo.memoNumber}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error generating memo PDF download:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
