import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  EMAIL_RUN_KIND_LABELS,
  MEMO_CATEGORY_LABELS,
  emailReportTypeLabel,
} from "@/lib/accounting/emailReport";

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  // Quote everything; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * GET /api/accounting/email-runs/[runId]/export
 * Every result of one email run as CSV.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const { runId } = await params;
    const run = await prisma.emailSendRun.findUnique({
      where: { id: runId },
      select: { id: true, type: true, kind: true, startedAt: true },
    });
    if (!run) {
      return NextResponse.json(
        { error: "Email run not found" },
        { status: 404 },
      );
    }

    const results = await prisma.emailSendResult.findMany({
      where: { runId },
      include: {
        invoice: {
          select: { invoiceNumber: true, invoiceType: true, totalAmount: true },
        },
        memo: { select: { memoNumber: true, amount: true, category: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const header = [
      "Document #",
      "Type",
      "Email",
      "Customer",
      "Customer Email",
      "CC",
      "Amount",
      "Status",
      "Error",
      "Sent At (UTC)",
    ];
    // Memo runs may link an invoice too, and a memo whose create email
    // failed was rolled back, so go by the run type, not which id is set.
    const isMemoRun = run.type === "MEMO";
    const rows = results.map((r) => [
      r.documentNumber ?? r.memo?.memoNumber ?? r.invoice?.invoiceNumber ?? "",
      isMemoRun
        ? r.memo
          ? `Memo - ${MEMO_CATEGORY_LABELS[r.memo.category] ?? r.memo.category}`
          : "Memo"
        : emailReportTypeLabel(r.invoice?.invoiceType ?? run.type),
      EMAIL_RUN_KIND_LABELS[run.kind] ?? run.kind,
      r.customerName,
      r.customerEmail,
      (r.ccEmails || "").split(",").filter(Boolean).join("; "),
      isMemoRun
        ? r.memo
          ? Number(r.memo.amount).toFixed(2)
          : ""
        : r.invoice
          ? Number(r.invoice.totalAmount).toFixed(2)
          : "",
      r.success ? "Sent" : "Failed",
      r.errorMessage || "",
      r.sentAt ? r.sentAt.toISOString() : "",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const date = run.startedAt.toISOString().slice(0, 10);
    const filename = `email-report-${run.type.toLowerCase()}-${date}-${run.id.slice(0, 8)}.csv`;

    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Export email run error:", error);
    return NextResponse.json(
      { error: "Failed to export email run" },
      { status: 500 },
    );
  }
}
