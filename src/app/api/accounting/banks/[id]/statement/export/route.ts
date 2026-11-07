import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { generatePDFFromHTML } from "@/lib/email";
import {
  buildCsv,
  buildTablePdfHtml,
  formatIsoDate,
  formatIssuedRange,
  formatTableCurrency,
  formatTableDate,
  utcDayStart,
} from "@/lib/helpers/admin/tableExport";
import { loadBankStatement } from "../shared";

// Same columns as the statement page, with Debit and Credit split so the
// CSV sums in a spreadsheet.
const COLUMNS = [
  { header: "Payment Date", nowrap: true },
  { header: "Invoice #" },
  { header: "Invoice Type" },
  { header: "Vendor / Customer" },
  { header: "Invoice Amount (USD)", align: "right" as const, nowrap: true },
  { header: "Debit (USD)", align: "right" as const, nowrap: true },
  { header: "Credit (USD)", align: "right" as const, nowrap: true },
  { header: "Original Amount", nowrap: true },
  { header: "Balance (USD)", align: "right" as const, nowrap: true },
  { header: "Notes" },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "bank";

/** GET /api/accounting/banks/[id]/statement/export?format=csv|pdf&from&to&tz */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    const result = await loadBankStatement(id, searchParams);
    if ("error" in result) return result.error;
    const { bank, statement, tz, from, to } = result;

    const now = new Date();
    const filename = `bank-statement-${slug(bank.name)}-${formatIsoDate(now, tz)}.${format}`;
    const csv = format === "csv";
    const date = (d: Date) =>
      csv ? formatIsoDate(d, tz) : formatTableDate(d, tz);
    const money = (v: { toFixed(n: number): string }) =>
      csv ? v.toFixed(2) : formatTableCurrency(v.toFixed(2));
    const empty = csv ? "" : "-";

    // A picked From/To day is a calendar day: format it as-is (UTC).
    const day = (ymd: string) =>
      csv ? ymd : formatTableDate(utcDayStart(ymd), "UTC");
    const balanceRow = (
      label: string,
      when: string,
      value: typeof statement.openingBalanceUsd,
    ) => [when, label, "", "", "", "", "", "", money(value), ""];

    const first = statement.rows[0]?.date;
    const last = statement.rows.at(-1)?.date;
    const openingDate = from ? day(from) : first ? date(first) : empty;
    const closingDate = to ? day(to) : last ? date(last) : empty;
    const rows: string[][] = [
      balanceRow("Opening balance", openingDate, statement.openingBalanceUsd),
      ...statement.rows.map((r) => [
        date(r.date),
        r.invoices.map((i) => i.number).join(", ") || empty,
        r.invoiceType,
        r.counterparty.name,
        r.invoiceAmountUsd ? money(r.invoiceAmountUsd) : empty,
        r.side === "DEBIT" ? money(r.amountUsd) : empty,
        r.side === "CREDIT" ? money(r.amountUsd) : empty,
        r.original ?? empty,
        money(r.balanceUsd),
        r.note,
      ]),
      balanceRow("Closing balance", closingDate, statement.closingBalanceUsd),
    ];

    if (csv) {
      return new NextResponse(
        buildCsv(
          COLUMNS.map((c) => c.header),
          rows,
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

    const html = buildTablePdfHtml({
      title: `Bank Statement — ${bank.name} (${bank.entity.name})`,
      subtitle: [
        `Period: ${formatIssuedRange(from, to)}`,
        `Currencies: ${bank.currencies.map((c) => c.currency.code).join(", ") || "-"}`,
        `Total Debit: ${formatTableCurrency(statement.totals.debitUsd.toFixed(2))}`,
        `Total Credit: ${formatTableCurrency(statement.totals.creditUsd.toFixed(2))}`,
        `Closing balance: ${formatTableCurrency(statement.closingBalanceUsd.toFixed(2))}`,
        "Amounts in USD at the rate saved with each payment",
      ].join(" · "),
      columns: COLUMNS,
      rows,
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
    console.error("[Bank Statement Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export the bank statement" },
      { status: 500 },
    );
  }
}
