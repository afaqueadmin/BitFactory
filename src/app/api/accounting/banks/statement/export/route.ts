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
import { loadConsolidatedStatement } from "../shared";

// The single-bank export's columns with Bank and Entity after the date.
const COLUMNS = [
  { header: "Payment Date", nowrap: true },
  { header: "Bank" },
  { header: "Entity" },
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

const BY_BANK_COLUMNS = [
  { header: "Bank" },
  { header: "Entity" },
  { header: "Opening (USD)", align: "right" as const, nowrap: true },
  { header: "Debit (USD)", align: "right" as const, nowrap: true },
  { header: "Credit (USD)", align: "right" as const, nowrap: true },
  { header: "Closing (USD)", align: "right" as const, nowrap: true },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** GET /api/accounting/banks/statement/export?format=csv|pdf&from&to&tz&entity&bank */
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

    const result = await loadConsolidatedStatement(searchParams);
    if ("error" in result) return result.error;
    const { entity, banks, allBanks, statement, byBank, unbanked, tz } = result;
    const { from, to } = result;
    const bankById = new Map(banks.map((b) => [b.id, b]));

    const now = new Date();
    const scope = allBanks
      ? entity
        ? slug(entity.name) || "entity"
        : "all-banks"
      : banks.length === 1
        ? slug(banks[0].name) || "bank"
        : `${banks.length}-banks`;
    const filename = `bank-statement-${scope}-${formatIsoDate(now, tz)}.${format}`;
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
    ) => [when, label, "", "", "", "", "", "", "", "", money(value), ""];

    const first = statement.rows[0]?.date;
    const last = statement.rows.at(-1)?.date;
    const openingDate = from ? day(from) : first ? date(first) : empty;
    const closingDate = to ? day(to) : last ? date(last) : empty;
    const rows: string[][] = [
      balanceRow("Opening balance", openingDate, statement.openingBalanceUsd),
      ...statement.rows.map((r) => {
        const bank = bankById.get(r.bankId);
        return [
          date(r.date),
          bank?.name ?? empty,
          bank?.entity.name ?? empty,
          r.invoices.map((i) => i.number).join(", ") || empty,
          r.invoiceType,
          r.counterparty.name,
          r.invoiceAmountUsd ? money(r.invoiceAmountUsd) : empty,
          r.side === "DEBIT" ? money(r.amountUsd) : empty,
          r.side === "CREDIT" ? money(r.amountUsd) : empty,
          r.original ?? empty,
          money(r.balanceUsd),
          r.note,
        ];
      }),
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

    const byBankRows = [
      ...byBank.map((b) => {
        const bank = bankById.get(b.bankId);
        return [
          bank ? `${bank.name}${bank.isActive ? "" : " (inactive)"}` : "-",
          bank?.entity.name ?? "-",
          money(b.openingBalanceUsd),
          money(b.debitUsd),
          money(b.creditUsd),
          money(b.closingBalanceUsd),
        ];
      }),
      [
        `Total (${banks.length} bank${banks.length === 1 ? "" : "s"})`,
        "",
        money(statement.openingBalanceUsd),
        money(statement.totals.debitUsd),
        money(statement.totals.creditUsd),
        money(statement.closingBalanceUsd),
      ],
    ];

    const scopeLabel = allBanks
      ? entity
        ? `All banks of ${entity.name}`
        : "All banks"
      : banks.map((b) => b.name).join(", ");
    const html = buildTablePdfHtml({
      title: `Consolidated Bank Statement — ${scopeLabel}`,
      subtitle: [
        `Period: ${formatIssuedRange(from, to)}`,
        `Total Debit: ${formatTableCurrency(statement.totals.debitUsd.toFixed(2))}`,
        `Total Credit: ${formatTableCurrency(statement.totals.creditUsd.toFixed(2))}`,
        `Closing balance: ${formatTableCurrency(statement.closingBalanceUsd.toFixed(2))}`,
        "Amounts in USD at the rate saved with each payment",
        ...(unbanked.count > 0
          ? [
              `${unbanked.count} payment${unbanked.count === 1 ? "" : "s"} (${formatTableCurrency(unbanked.amountUsd.toFixed(2))}) in this period have no bank recorded and are not included`,
            ]
          : []),
      ].join(" · "),
      before: [
        { heading: "By bank", columns: BY_BANK_COLUMNS, rows: byBankRows },
      ],
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
    console.error("[Consolidated Bank Statement Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export the consolidated statement" },
      { status: 500 },
    );
  }
}
