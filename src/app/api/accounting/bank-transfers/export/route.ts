import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { generatePDFFromHTML } from "@/lib/email";
import {
  parseTransferListQuery,
  transferListRows,
} from "@/lib/accounting/transferLists";
import { formatAmount } from "@/lib/accounting/bankStatementRows";
import {
  buildCsv,
  buildTablePdfHtml,
  formatIsoDate,
  formatIssuedRange,
  formatTableCurrency,
  formatTableDate,
  utcDayStart,
} from "@/lib/helpers/admin/tableExport";
import { transferInclude, transferJson } from "../shared";

const COLUMNS = [
  { header: "Date", nowrap: true },
  { header: "From" },
  { header: "To" },
  { header: "Sent", align: "right" as const, nowrap: true },
  { header: "Sending Fee (USD)", align: "right" as const, nowrap: true },
  { header: "Received", align: "right" as const, nowrap: true },
  { header: "Receiving Fee (USD)", align: "right" as const, nowrap: true },
  { header: "Rate", nowrap: true },
  { header: "Value (USD)", align: "right" as const, nowrap: true },
  { header: "Inter-company" },
  { header: "Reference" },
  { header: "Note" },
];

/**
 * GET /api/accounting/bank-transfers/export?format=csv|pdf&entity&bank&from&to&sort&dir&tz
 * The Transfers list as shown: same filters, same order, plus a total row.
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
    const { filter, sort } = parseTransferListQuery(searchParams);

    const transfers = await prisma.accountingBankTransfer.findMany({
      include: transferInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const rows = transferListRows(transfers.map(transferJson), filter, sort);

    const csv = format === "csv";
    const money = (v: number | string) =>
      csv ? Number(v).toFixed(2) : formatTableCurrency(v);
    // Transfer dates are calendar days: format them as-is (UTC).
    const day = (ymd: string) =>
      csv ? ymd : formatTableDate(utcDayStart(ymd), "UTC");
    const centsOf = (v: string) => Math.round(Number(v) * 100);
    const total = (pick: (t: (typeof rows)[number]) => string) =>
      rows.reduce((s, t) => s + centsOf(pick(t)), 0) / 100;
    const sideLabel = (s: (typeof rows)[number]["from"]) =>
      `${s.bankName} (${s.entityName})`;

    const body: string[][] = rows.map((t) => [
      day(t.date),
      sideLabel(t.from),
      sideLabel(t.to),
      formatAmount(new Decimal(t.from.amount), t.from.currencyCode),
      Number(t.from.feeUsd) > 0 ? money(t.from.feeUsd) : "",
      formatAmount(new Decimal(t.to.amount), t.to.currencyCode),
      Number(t.to.feeUsd) > 0 ? money(t.to.feeUsd) : "",
      t.from.currencyCode !== t.to.currencyCode
        ? `1 ${t.from.currencyCode} = ${t.conversionRate} ${t.to.currencyCode}`
        : "",
      money(t.amountUsd),
      t.interCompany ? "Yes" : "",
      t.reference ?? "",
      t.note ?? "",
    ]);
    if (rows.length > 0) {
      body.push([
        `Total (${rows.length} transfer${rows.length === 1 ? "" : "s"})`,
        "",
        "",
        "",
        money(total((t) => t.from.feeUsd)),
        "",
        money(total((t) => t.to.feeUsd)),
        "",
        money(total((t) => t.amountUsd)),
        "",
        "",
        "",
      ]);
    }

    const now = new Date();
    const filename = `transfers-${formatIsoDate(now, tz)}.${format}`;
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

    const [entity, bank] = await Promise.all([
      filter.entityId
        ? prisma.accountingEntity.findUnique({
            where: { id: filter.entityId },
            select: { name: true },
          })
        : null,
      filter.bankId
        ? prisma.accountingBank.findUnique({
            where: { id: filter.bankId },
            select: { name: true },
          })
        : null,
    ]);
    const html = buildTablePdfHtml({
      title: "Internal Bank Transfers",
      subtitle: [
        `Period: ${formatIssuedRange(filter.from || null, filter.to || null)}`,
        `Entity: ${entity?.name ?? "All"}`,
        `Bank: ${bank?.name ?? "All"}`,
        `${rows.length} transfer${rows.length === 1 ? "" : "s"}`,
        "A Credit on the sending bank and a Debit on the receiving bank",
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
    console.error("[Bank Transfers Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export transfers" },
      { status: 500 },
    );
  }
}
