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
import { parseVendorInvoiceQuery } from "../query";

// Exports the Farm Tariffs table: every vendor invoice matching the list
// filters/sort, unpaginated, with the same columns as the dashboard table.
const COLUMNS = [
  { header: "Invoice" },
  { header: "Amount", align: "right" as const, nowrap: true },
  { header: "Status", nowrap: true },
  { header: "Issued Date", nowrap: true },
  { header: "Paid Date", nowrap: true },
  { header: "Due Date", nowrap: true },
  { header: "Days Until Due", nowrap: true },
];

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
        { error: "Only administrators can export vendor invoices" },
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
    const tz = resolveExportTimeZone(searchParams.get("tz"));
    const { where, orderBy } = parseVendorInvoiceQuery(searchParams);

    const vendorInvoices = await prisma.vendorInvoice.findMany({
      where,
      orderBy,
      select: {
        invoiceNumber: true,
        totalAmount: true,
        paymentStatus: true,
        billingDate: true,
        paidDate: true,
        dueDate: true,
      },
    });

    const now = new Date();
    const filename = `farm-tariffs-${formatIsoDate(now, tz)}.${format}`;

    // Mirrors the table: Paid Date only for Paid invoices, Days Until Due
    // blank ("-") for Paid ones.
    const toRow = (
      invoice: (typeof vendorInvoices)[number],
      date: (d: Date) => string,
      amount: (v: number) => string,
      empty: string,
    ) => {
      const isPaid = invoice.paymentStatus === "Paid";
      return [
        invoice.invoiceNumber,
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
        vendorInvoices.map((invoice) =>
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

    const html = buildTablePdfHtml({
      title: "Farm Tariffs — Vendor Invoices",
      columns: COLUMNS,
      rows: vendorInvoices.map((invoice) =>
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
    console.error("[Farm Tariffs Export] Error:", error);
    return NextResponse.json(
      { error: "Failed to export vendor invoices" },
      { status: 500 },
    );
  }
}
