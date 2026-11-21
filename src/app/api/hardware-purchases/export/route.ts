import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { generatePDFFromHTML } from "@/lib/email";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/accounting";
import {
  buildCsv,
  buildTablePdfHtml,
  daysUntilDue,
  formatDaysUntilDue,
  formatIsoDate,
  formatIssuedRange,
  formatTableCurrency,
  formatTableDate,
  resolveExportTimeZone,
} from "@/lib/helpers/admin/tableExport";
import { parseHardwarePurchaseQuery } from "../query";

// Exports the Hardware Purchases table: every hardware purchase invoice
// matching the list filters/sort, unpaginated, with the same columns as the
// dashboard table.
const COLUMNS = [
  { header: "Invoice" },
  { header: "Vendor" },
  { header: "Hardware" },
  { header: "Amount", align: "right" as const, nowrap: true },
  { header: "Status", nowrap: true },
  { header: "Issued Date", nowrap: true },
  { header: "Paid Date", nowrap: true },
  { header: "Due Date", nowrap: true },
  { header: "Days Until Due", nowrap: true },
];

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["hardware_purchases.view"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    if (format !== "csv" && format !== "pdf") {
      return NextResponse.json(
        { error: "format must be csv or pdf" },
        { status: 400 },
      );
    }
    const tz = resolveExportTimeZone(searchParams.get("tz"));
    const { where, orderBy, filters } =
      parseHardwarePurchaseQuery(searchParams);

    const hardwarePurchases = await prisma.hardwarePurchaseInvoice.findMany({
      where,
      orderBy,
      select: {
        invoiceNumber: true,
        vendor: { select: { name: true } },
        hardwareDescription: true,
        totalAmount: true,
        paymentStatus: true,
        billingDate: true,
        paidDate: true,
        dueDate: true,
      },
    });

    const now = new Date();
    const filename = `hardware-purchases-${formatIsoDate(now, tz)}.${format}`;

    // Mirrors the table: Paid Date only for Paid invoices, Days Until Due
    // blank ("-") for Paid ones.
    const toRow = (
      invoice: (typeof hardwarePurchases)[number],
      date: (d: Date) => string,
      amount: (v: number) => string,
      empty: string,
    ) => {
      const isPaid = invoice.paymentStatus === "Paid";
      return [
        invoice.invoiceNumber,
        invoice.vendor.name,
        invoice.hardwareDescription,
        amount(Number(invoice.totalAmount)),
        INVOICE_STATUS_LABELS[invoice.paymentStatus],
        invoice.billingDate ? date(invoice.billingDate) : empty,
        isPaid && invoice.paidDate ? date(invoice.paidDate) : empty,
        date(invoice.dueDate),
        isPaid
          ? "-"
          : formatDaysUntilDue(daysUntilDue(invoice.dueDate, tz, now)),
      ];
    };

    if (format === "csv") {
      const csv = buildCsv(
        COLUMNS.map((c) => c.header),
        hardwarePurchases.map((invoice) =>
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
    const filterVendor = filters.vendorId
      ? await prisma.accountingVendor.findUnique({
          where: { id: filters.vendorId },
          select: { name: true },
        })
      : null;
    const subtitle = [
      `Vendor: ${filters.vendorId ? (filterVendor?.name ?? "Unknown vendor") : "All vendors"}`,
      `Hardware: ${filters.hardware ? `"${filters.hardware}"` : "All hardware"}`,
      `Status: ${
        filters.paymentStatus
          ? INVOICE_STATUS_LABELS[filters.paymentStatus]
          : "All statuses"
      }`,
      `Issued: ${formatIssuedRange(filters.startDate, filters.endDate)}`,
    ].join(" · ");

    const html = buildTablePdfHtml({
      title: "Hardware Purchases — Purchase Invoices",
      subtitle,
      columns: COLUMNS,
      rows: hardwarePurchases.map((invoice) =>
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
    console.error("[Hardware Purchases Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export hardware purchase invoices" },
      { status: 500 },
    );
  }
}
