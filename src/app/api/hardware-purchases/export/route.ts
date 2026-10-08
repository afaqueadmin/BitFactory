import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generatePDFFromHTML } from "@/lib/email";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/accounting";
import { VENDOR_NAME_LABELS } from "@/lib/hooks/useHardwarePurchases";
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
        { error: "Only administrators can export hardware purchase invoices" },
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
    const { where, orderBy } = parseHardwarePurchaseQuery(searchParams);

    const hardwarePurchases = await prisma.hardwarePurchaseInvoice.findMany({
      where,
      orderBy,
      select: {
        invoiceNumber: true,
        vendorName: true,
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
        VENDOR_NAME_LABELS[invoice.vendorName] || invoice.vendorName,
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

    const html = buildTablePdfHtml({
      title: "Hardware Purchases — Purchase Invoices",
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
