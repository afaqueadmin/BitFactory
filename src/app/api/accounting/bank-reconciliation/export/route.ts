import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { generatePDFFromHTML } from "@/lib/email";
import {
  parseReconciliationListQuery,
  reconciliationListRows,
} from "@/lib/accounting/bankReconciliationLists";
import { reconciliationTypeLabel } from "@/lib/accounting/bankReconciliation";
import { formatOriginal } from "@/lib/accounting/bankStatementRows";
import {
  buildCsv,
  buildTablePdfHtml,
  formatIsoDate,
  formatIssuedRange,
  formatTableCurrency,
  formatTableDate,
  utcDayStart,
} from "@/lib/helpers/admin/tableExport";
import { reconciliationInclude, reconciliationJson } from "../shared";

const COLUMNS = [
  { header: "Entry #", nowrap: true },
  { header: "Date", nowrap: true },
  { header: "Invoice #", nowrap: true },
  { header: "Invoice Type" },
  { header: "Client" },
  { header: "Narration" },
  { header: "Entity / Bank" },
  { header: "Original Amount", align: "right" as const, nowrap: true },
  { header: "Received (USD)", align: "right" as const, nowrap: true },
  { header: "Fee (USD)", align: "right" as const, nowrap: true },
  { header: "Net Added (USD)", align: "right" as const, nowrap: true },
];

/**
 * GET /api/accounting/bank-reconciliation/export?format=csv|pdf&type&bank&from&to&sort&dir&tz
 * The Bank Reconciliation list as shown: same filters, same order, plus a
 * total row.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    if (format !== "csv" && format !== "pdf") {
      return NextResponse.json(
        { error: "format must be csv or pdf" },
        { status: 400 },
      );
    }
    const tz = searchParams.get("tz") || "UTC";
    const { filter, sort } = parseReconciliationListQuery(searchParams);

    const entries = await prisma.accountingBankReconciliation.findMany({
      include: reconciliationInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const rows = reconciliationListRows(
      entries.map(reconciliationJson),
      filter,
      sort,
    );

    const csv = format === "csv";
    const money = (v: number | string) =>
      csv ? Number(v).toFixed(2) : formatTableCurrency(v);
    // Entry dates are calendar days: format them as-is (UTC).
    const day = (ymd: string) =>
      csv ? ymd : formatTableDate(utcDayStart(ymd), "UTC");
    const centsOf = (v: string) => Math.round(Number(v) * 100);
    const total = (key: "amountUsd" | "feeUsd") =>
      rows.reduce((s, e) => s + centsOf(e[key]), 0) / 100;

    const body: string[][] = rows.map((e) => [
      e.entryLabel,
      day(e.date),
      e.invoiceNumber,
      reconciliationTypeLabel(e.invoiceType),
      e.clientName,
      e.narration ?? "",
      `${e.bankName} (${e.entityName})`,
      formatOriginal(
        new Decimal(e.amount),
        e.currencyCode,
        new Decimal(e.exchangeRate),
      ) ?? "",
      money(e.amountUsd),
      money(e.feeUsd),
      money((centsOf(e.amountUsd) - centsOf(e.feeUsd)) / 100),
    ]);
    if (rows.length > 0) {
      body.push([
        `Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})`,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        money(total("amountUsd")),
        money(total("feeUsd")),
        money(total("amountUsd") - total("feeUsd")),
      ]);
    }

    const now = new Date();
    const filename = `bank-reconciliation-${formatIsoDate(now, tz)}.${format}`;
    if (csv) {
      return new NextResponse(
        buildCsv(
          COLUMNS.map((c) => c.header),
          body,
        ),
        {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        },
      );
    }

    const bank = filter.bankId
      ? await prisma.accountingBank.findUnique({
          where: { id: filter.bankId },
          select: { name: true },
        })
      : null;
    const html = buildTablePdfHtml({
      title: "Bank Reconciliation",
      subtitle: [
        `Period: ${formatIssuedRange(filter.from || null, filter.to || null)}`,
        `Invoice type: ${filter.invoiceType ? reconciliationTypeLabel(filter.invoiceType) : "All"}`,
        `Bank: ${bank?.name ?? "All"}`,
        `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`,
        "Received is a Debit on the bank; the fee is a Credit",
      ].join(" · "),
      columns: COLUMNS,
      rows: body,
      generatedAt: now,
      tz,
    });
    const pdfBuffer = await generatePDFFromHTML(html);
    return new NextResponse(pdfBuffer as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Bank Reconciliation Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export Bank Reconciliation" },
      { status: 500 },
    );
  }
}
