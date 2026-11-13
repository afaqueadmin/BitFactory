import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { presignDownload } from "@/lib/storage/r2";

/** Opens an expense payment's receipt PDF. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;

    const payment = await prisma.accountingExpensePayment.findUnique({
      where: { id },
      select: { receiptKey: true },
    });
    if (!payment?.receiptKey) {
      return NextResponse.json({ error: "No PDF on file" }, { status: 404 });
    }

    return NextResponse.redirect(
      await presignDownload(payment.receiptKey),
      302,
    );
  } catch (error) {
    console.error("Error opening expense receipt:", error);
    return NextResponse.json(
      { error: "Failed to open the PDF" },
      { status: 500 },
    );
  }
}
