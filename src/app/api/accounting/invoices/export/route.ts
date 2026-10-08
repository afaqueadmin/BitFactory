import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generatePDFFromHTML } from "@/lib/email";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/accounting";
import {
  buildCsv,
  buildTablePdfHtml,
  daysUntilDue,
  formatDaysUntilDue,
  formatIsoDate,
  formatTableCurrency,
  formatTableDate,
  resolveExportTimeZone,
} from "@/lib/helpers/admin/tableExport";
import {
  buildInvoiceListWhere,
  buildInvoiceOrderBy,
  DEFAULT_INVOICE_ORDER,
  getPaidPastDueDays,
  isInMemoryInvoiceSort,
  parseInvoiceListSort,
  sortInvoicesInMemory,
} from "../query";

// Exports an accounting invoice table: every invoice matching the list
// filters/sort, unpaginated, with the same columns as the dashboard table.
const EXPORTS = {
  ELECTRICITY_CHARGES: {
    title: "Hosting & Colocation — Invoices",
    filenamePrefix: "hosting-and-colocation",
    paidPastDueColumn: true,
  },
  HARDWARE_SALES: {
    title: "Hardware Sales — Invoices",
    filenamePrefix: "hardware-sales",
    paidPastDueColumn: false,
  },
} as const;

type ExportInvoiceType = keyof typeof EXPORTS;

const isExportInvoiceType = (
  value: string | null,
): value is ExportInvoiceType =>
  value !== null && Object.prototype.hasOwnProperty.call(EXPORTS, value);

const PAID_PAST_DUE_HEADER = "Paid Past Due";

const ALL_COLUMNS = [
  { header: "Invoice" },
  { header: "Customer" },
  { header: "Amount", align: "right" as const, nowrap: true },
  { header: "Status", nowrap: true },
  { header: "Issued Date", nowrap: true },
  { header: "Paid Date", nowrap: true },
  { header: "Due Date", nowrap: true },
  { header: PAID_PAST_DUE_HEADER, nowrap: true },
  { header: "Days Until Due", nowrap: true },
];

const pluralDays = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can export invoices" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    if (format !== "csv" && format !== "pdf") {
      return NextResponse.json(
        { error: "format must be csv or pdf" },
        { status: 400 },
      );
    }
    const invoiceType = searchParams.get("invoiceType");
    if (!isExportInvoiceType(invoiceType)) {
      return NextResponse.json(
        { error: "invoiceType must be ELECTRICITY_CHARGES or HARDWARE_SALES" },
        { status: 400 },
      );
    }
    const exportConfig = EXPORTS[invoiceType];
    const columns = exportConfig.paidPastDueColumn
      ? ALL_COLUMNS
      : ALL_COLUMNS.filter((c) => c.header !== PAID_PAST_DUE_HEADER);
    const tz = resolveExportTimeZone(searchParams.get("tz"));

    // Only admins reach this point (checked above).
    const where = buildInvoiceListWhere(searchParams, true);
    const { sortBy, sortDirection } = parseInvoiceListSort(searchParams);
    const select = {
      invoiceNumber: true,
      userId: true,
      totalAmount: true,
      status: true,
      issuedDate: true,
      invoiceGeneratedDate: true,
      paidDate: true,
      dueDate: true,
      user: { select: { name: true } },
    };

    const invoices = isInMemoryInvoiceSort(sortBy)
      ? sortInvoicesInMemory(
          await prisma.invoice.findMany({
            where,
            select,
            orderBy: DEFAULT_INVOICE_ORDER,
          }),
          sortBy,
          sortDirection,
        )
      : await prisma.invoice.findMany({
          where,
          select,
          orderBy: buildInvoiceOrderBy(sortBy, sortDirection),
        });

    const now = new Date();
    const filename = `${exportConfig.filenamePrefix}-${formatIsoDate(now, tz)}.${format}`;

    // Mirrors the table: Paid Date and Paid Past Due only for PAID invoices,
    // Days Until Due blank ("-") for PAID ones.
    const toRow = (
      invoice: (typeof invoices)[number],
      date: (d: Date) => string,
      amount: (v: number) => string,
      empty: string,
    ) => {
      const isPaid = invoice.status === "PAID";
      const paidPastDue = getPaidPastDueDays(invoice);
      return [
        invoice.invoiceNumber,
        invoice.user?.name || `Customer ${invoice.userId.slice(0, 8)}`,
        amount(Number(invoice.totalAmount)),
        INVOICE_STATUS_LABELS[invoice.status],
        invoice.issuedDate ? date(invoice.issuedDate) : empty,
        isPaid && invoice.paidDate ? date(invoice.paidDate) : empty,
        date(invoice.dueDate),
        ...(exportConfig.paidPastDueColumn
          ? [paidPastDue === null ? "-" : pluralDays(paidPastDue)]
          : []),
        isPaid
          ? "-"
          : formatDaysUntilDue(daysUntilDue(invoice.dueDate, tz, now)),
      ];
    };

    if (format === "csv") {
      const csv = buildCsv(
        columns.map((c) => c.header),
        invoices.map((invoice) =>
          toRow(
            invoice,
            (d) => formatIsoDate(d, tz),
            (v) => v.toFixed(2),
            "",
          ),
        ),
      );

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Name the active filters on the PDF so a printed copy is unambiguous.
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const customer = customerId
      ? await prisma.user.findUnique({
          where: { id: customerId },
          select: { name: true, email: true },
        })
      : null;
    const customerLabel = customerId
      ? customer?.name || customer?.email || customerId
      : "All customers";
    const statusLabel = status
      ? INVOICE_STATUS_LABELS[status as keyof typeof INVOICE_STATUS_LABELS] ||
        status
      : "All statuses";

    const html = buildTablePdfHtml({
      title: exportConfig.title,
      subtitle: `Customer: ${customerLabel} · Status: ${statusLabel}`,
      columns,
      rows: invoices.map((invoice) =>
        toRow(invoice, (d) => formatTableDate(d, tz), formatTableCurrency, "-"),
      ),
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
    console.error("[Invoice Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export invoices" },
      { status: 500 },
    );
  }
}
