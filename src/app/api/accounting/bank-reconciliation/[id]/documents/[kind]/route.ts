import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { presignDownload } from "@/lib/storage/r2";

/** Opens an entry's PDF (inline) or downloads its Excel / CSV sheet. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  try {
    const auth = await authorizeStaff(request, ["bank_reconciliation.view"]);
    if ("response" in auth) return auth.response;
    const { id, kind } = await params;
    if (kind !== "pdf" && kind !== "sheet") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const entry = await prisma.accountingBankReconciliation.findUnique({
      where: { id },
      select: { pdfKey: true, pdfName: true, sheetKey: true, sheetName: true },
    });
    const key = kind === "pdf" ? entry?.pdfKey : entry?.sheetKey;
    if (!entry || !key) {
      return NextResponse.json({ error: "No file on record" }, { status: 404 });
    }
    const fileName =
      (kind === "pdf" ? entry.pdfName : entry.sheetName) ?? undefined;

    return NextResponse.redirect(
      await presignDownload(key, {
        disposition: kind === "pdf" ? "inline" : "attachment",
        fileName,
      }),
      302,
    );
  } catch (error) {
    console.error("Error opening Bank Reconciliation file:", error);
    return NextResponse.json(
      { error: "Failed to open the file" },
      { status: 500 },
    );
  }
}
