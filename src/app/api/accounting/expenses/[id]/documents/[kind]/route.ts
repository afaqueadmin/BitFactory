import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { presignDownload } from "@/lib/storage/r2";

/** Opens an expense's PDF (inline) or downloads its Excel / CSV sheet. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { id, kind } = await params;
    if (kind !== "pdf" && kind !== "sheet") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const expense = await prisma.accountingExpense.findUnique({
      where: { id },
      select: { pdfKey: true, pdfName: true, sheetKey: true, sheetName: true },
    });
    const key = kind === "pdf" ? expense?.pdfKey : expense?.sheetKey;
    if (!expense || !key) {
      return NextResponse.json({ error: "No file on record" }, { status: 404 });
    }
    const fileName =
      (kind === "pdf" ? expense.pdfName : expense.sheetName) ?? undefined;

    return NextResponse.redirect(
      await presignDownload(key, {
        disposition: kind === "pdf" ? "inline" : "attachment",
        fileName,
      }),
      302,
    );
  } catch (error) {
    console.error("Error opening expense file:", error);
    return NextResponse.json(
      { error: "Failed to open the file" },
      { status: 500 },
    );
  }
}
