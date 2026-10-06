import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { presignDownload } from "@/lib/storage/r2";

/** Opens a Farm Tariff invoice's stored PDF: kind = invoice | receipt. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { id, kind } = await params;

    if (kind !== "invoice" && kind !== "receipt") {
      return NextResponse.json({ error: "Unknown document" }, { status: 404 });
    }

    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id },
      select: { invoicePdfKey: true, paymentReceiptKey: true },
    });
    const key =
      kind === "invoice" ? invoice?.invoicePdfKey : invoice?.paymentReceiptKey;
    if (!key) {
      return NextResponse.json({ error: "No PDF on file" }, { status: 404 });
    }

    return NextResponse.redirect(await presignDownload(key), 302);
  } catch (error) {
    console.error("Error opening vendor invoice document:", error);
    return NextResponse.json(
      { error: "Failed to open the PDF" },
      { status: 500 },
    );
  }
}
